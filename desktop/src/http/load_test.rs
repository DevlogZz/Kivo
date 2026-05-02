use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, USER_AGENT};
use serde::{Deserialize, Serialize};
use tokio::sync::watch;
use tokio::time::sleep;

const DEFAULT_USER_AGENT: &str = concat!("kivo/", env!("CARGO_PKG_VERSION"));
const MAX_ERRORS_PER_WORKER: usize = 10;

static CANCEL_REGISTRY: OnceLock<Mutex<HashMap<String, watch::Sender<bool>>>> = OnceLock::new();

fn cancel_registry() -> &'static Mutex<HashMap<String, watch::Sender<bool>>> {
    CANCEL_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

struct LoadTestCancelGuard {
    test_id: String,
}

impl LoadTestCancelGuard {
    fn new(test_id: String, tx: watch::Sender<bool>) -> Self {
        cancel_registry().lock().unwrap().insert(test_id.clone(), tx);
        Self { test_id }
    }
}

impl Drop for LoadTestCancelGuard {
    fn drop(&mut self) {
        cancel_registry().lock().unwrap().remove(&self.test_id);
    }
}

#[tauri::command]
pub async fn cancel_load_test(test_id: String) -> bool {
    if let Some(tx) = cancel_registry().lock().unwrap().get(&test_id) {
        let _ = tx.send(true);
        true
    } else {
        false
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadTestPayload {
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub test_id: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
    pub virtual_users: u32,
    pub duration_secs: u32,
    #[serde(default)]
    pub ramp_up_secs: Option<u32>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LatencyHistogram {
    pub p50: u64,
    pub p75: u64,
    pub p90: u64,
    pub p95: u64,
    pub p99: u64,
    pub p999: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TimelineBucket {
    pub second: u64,
    pub requests: u64,
    pub errors: u64,
    pub avg_latency_ms: f64,
    pub rps: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LoadTestResult {
    pub total_requests: u64,
    pub successful: u64,
    pub failed: u64,
    pub avg_latency_ms: f64,
    pub min_latency_ms: u64,
    pub max_latency_ms: u64,
    pub latency_histogram: LatencyHistogram,
    pub requests_per_sec: f64,
    pub peak_rps: f64,
    pub error_rate: f64,
    pub status_codes: HashMap<String, u64>,
    pub bytes_received: u64,
    pub duration_ms: u64,
    pub timeline: Vec<TimelineBucket>,
    pub errors: Vec<String>,
    pub connection_errors: u64,
    pub timeout_errors: u64,
    pub was_cancelled: bool,
}

struct BucketStats {
    requests: AtomicU64,
    errors: AtomicU64,
    latency_sum: AtomicU64,
}

impl BucketStats {
    fn new() -> Self {
        Self {
            requests: AtomicU64::new(0),
            errors: AtomicU64::new(0),
            latency_sum: AtomicU64::new(0),
        }
    }
}

struct WorkerResult {
    latencies: Vec<u64>,
    status_codes: HashMap<String, u64>,
    errors: Vec<String>,
    local_success: u64,
    local_fail: u64,
    local_bytes: u64,
    local_timeouts: u64,
    local_connects: u64,
}

fn build_load_test_headers(headers: &HashMap<String, String>) -> Result<HeaderMap, String> {
    let mut header_map = HeaderMap::new();
    for (key, value) in headers {
        let trimmed_key = key.trim();
        if trimmed_key.is_empty() {
            continue;
        }
        let name = HeaderName::from_bytes(trimmed_key.as_bytes())
            .map_err(|_| format!("Invalid header name: {trimmed_key}"))?;
        let header_value =
            HeaderValue::from_str(value).map_err(|_| format!("Invalid header value for: {trimmed_key}"))?;
        header_map.insert(name, header_value);
    }
    if !header_map.contains_key(USER_AGENT) {
        header_map.insert(USER_AGENT, HeaderValue::from_static(DEFAULT_USER_AGENT));
    }
    Ok(header_map)
}

fn percentile(sorted: &[u64], p: f64) -> u64 {
    if sorted.is_empty() {
        return 0;
    }
    let rank = (p / 100.0 * sorted.len() as f64).ceil() as usize;
    sorted[rank.saturating_sub(1).min(sorted.len() - 1)]
}

fn compute_histogram(sorted: &[u64]) -> LatencyHistogram {
    LatencyHistogram {
        p50: percentile(sorted, 50.0),
        p75: percentile(sorted, 75.0),
        p90: percentile(sorted, 90.0),
        p95: percentile(sorted, 95.0),
        p99: percentile(sorted, 99.0),
        p999: percentile(sorted, 99.9),
    }
}

fn compute_worker_count(virtual_users: usize) -> usize {
    virtual_users.min(2048)
}

#[tauri::command]
pub async fn run_load_test(payload: LoadTestPayload) -> Result<LoadTestResult, String> {
    let virtual_users = (payload.virtual_users as usize).clamp(1, 10_000);
    let duration_secs = (payload.duration_secs as u64).clamp(1, 600);
    let ramp_up_secs = payload.ramp_up_secs.unwrap_or(0).min(payload.duration_secs) as u64;
    let timeout_ms = payload.timeout_ms.unwrap_or(15_000).clamp(500, 120_000);

    let url = payload.url.trim().to_string();
    if url.is_empty() {
        return Err("URL is required.".to_string());
    }

    let test_id = if payload.test_id.trim().is_empty() {
        format!("lt-{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis())
    } else {
        payload.test_id.trim().to_string()
    };

    let (cancel_tx, cancel_rx) = watch::channel(false);
    let _guard = LoadTestCancelGuard::new(test_id.clone(), cancel_tx);

    let header_map = build_load_test_headers(&payload.headers)?;

    let worker_count = compute_worker_count(virtual_users);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .default_headers(header_map)
        .redirect(reqwest::redirect::Policy::limited(10))
        .pool_max_idle_per_host(worker_count.min(256))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let client = Arc::new(client);
    let method = payload.method.trim().to_uppercase();
    let body = payload.body.filter(|b| !b.trim().is_empty());

    let bucket_count = duration_secs as usize + 2;
    let buckets: Arc<Vec<BucketStats>> = Arc::new(
        (0..bucket_count).map(|_| BucketStats::new()).collect(),
    );

    let test_start = Instant::now();
    let test_deadline = test_start + Duration::from_secs(duration_secs);

    let ramp_duration_ms = ramp_up_secs * 1000;

    let mut handles = Vec::with_capacity(worker_count);

    for worker_index in 0..worker_count {
        let client = Arc::clone(&client);
        let url = url.clone();
        let method = method.clone();
        let body = body.clone();
        let buckets = Arc::clone(&buckets);
        let mut cancel_rx = cancel_rx.clone();

        let ramp_delay_ms = if ramp_duration_ms > 0 && worker_count > 1 {
            (ramp_duration_ms * worker_index as u64) / (worker_count as u64 - 1)
        } else {
            0
        };

        let handle = tokio::spawn(async move {
            let mut result = WorkerResult {
                latencies: Vec::with_capacity(512),
                status_codes: HashMap::new(),
                errors: Vec::new(),
                local_success: 0,
                local_fail: 0,
                local_bytes: 0,
                local_timeouts: 0,
                local_connects: 0,
            };

            if ramp_delay_ms > 0 {
                tokio::select! {
                    _ = sleep(Duration::from_millis(ramp_delay_ms)) => {}
                    _ = cancel_rx.changed() => { return result; }
                }
                if *cancel_rx.borrow() {
                    return result;
                }
            }

            loop {
                if *cancel_rx.borrow() || Instant::now() >= test_deadline {
                    break;
                }

                let req_builder = match method.as_str() {
                    "POST" | "PUT" | "PATCH" => {
                        let mut r = match method.as_str() {
                            "POST" => client.post(&url),
                            "PUT" => client.put(&url),
                            _ => client.patch(&url),
                        };
                        if let Some(ref b) = body {
                            r = r.body(b.clone());
                        }
                        r
                    }
                    "DELETE" => client.delete(&url),
                    "HEAD" => client.head(&url),
                    "OPTIONS" => client.request(reqwest::Method::OPTIONS, &url),
                    _ => client.get(&url),
                };

                let req_start = Instant::now();

                let outcome = tokio::select! {
                    biased;
                    _ = cancel_rx.changed() => {
                        if *cancel_rx.borrow() { break; }
                        None
                    }
                    res = req_builder.send() => Some(res),
                };

                let Some(net_result) = outcome else { break };

                let latency_ms = req_start.elapsed().as_millis() as u64;
                let elapsed_secs = test_start.elapsed().as_secs() as usize;
                let bucket_idx = elapsed_secs.min(bucket_count - 1);

                result.latencies.push(latency_ms);
                buckets[bucket_idx].requests.fetch_add(1, Ordering::Relaxed);
                buckets[bucket_idx].latency_sum.fetch_add(latency_ms, Ordering::Relaxed);

                match net_result {
                    Ok(response) => {
                        let status = response.status();
                        let code = status.as_u16().to_string();
                        if status.is_success() {
                            result.local_success += 1;
                        } else {
                            result.local_fail += 1;
                            buckets[bucket_idx].errors.fetch_add(1, Ordering::Relaxed);
                        }
                        *result.status_codes.entry(code).or_insert(0) += 1;
                        match response.content_length() {
                            Some(len) => {
                                result.local_bytes += len;
                                let _ = response.bytes().await;
                            }
                            None => {
                                if let Ok(bytes) = response.bytes().await {
                                    result.local_bytes += bytes.len() as u64;
                                }
                            }
                        }
                    }
                    Err(err) => {
                        result.local_fail += 1;
                        buckets[bucket_idx].errors.fetch_add(1, Ordering::Relaxed);
                        if err.is_timeout() {
                            result.local_timeouts += 1;
                        } else if err.is_connect() {
                            result.local_connects += 1;
                        }
                        if result.errors.len() < MAX_ERRORS_PER_WORKER {
                            let msg = if err.is_timeout() {
                                format!("[timeout] {err}")
                            } else if err.is_connect() {
                                format!("[connect] {err}")
                            } else {
                                err.to_string()
                            };
                            result.errors.push(msg);
                        }
                    }
                }

                tokio::task::yield_now().await;
            }

            result
        });

        handles.push(handle);
    }

    let mut all_latencies: Vec<u64> = Vec::new();
    let mut merged_status: HashMap<String, u64> = HashMap::new();
    let mut merged_errors: Vec<String> = Vec::new();
    let mut total_success: u64 = 0;
    let mut total_fail: u64 = 0;
    let mut total_bytes: u64 = 0;
    let mut total_timeouts: u64 = 0;
    let mut total_connects: u64 = 0;

    for handle in handles {
        if let Ok(wr) = handle.await {
            all_latencies.extend(wr.latencies);
            for (code, count) in wr.status_codes {
                *merged_status.entry(code).or_insert(0) += count;
            }
            if merged_errors.len() < 50 {
                let remaining = 50 - merged_errors.len();
                merged_errors.extend(wr.errors.into_iter().take(remaining));
            }
            total_success += wr.local_success;
            total_fail += wr.local_fail;
            total_bytes += wr.local_bytes;
            total_timeouts += wr.local_timeouts;
            total_connects += wr.local_connects;
        }
    }

    let was_cancelled = *cancel_rx.borrow();
    let actual_duration_ms = test_start.elapsed().as_millis() as u64;
    let actual_duration_secs = actual_duration_ms as f64 / 1000.0;

    let total = all_latencies.len() as u64;

    all_latencies.sort_unstable();

    let avg_latency = if all_latencies.is_empty() {
        0.0
    } else {
        all_latencies.iter().sum::<u64>() as f64 / all_latencies.len() as f64
    };

    let min_latency = all_latencies.first().copied().unwrap_or(0);
    let max_latency = all_latencies.last().copied().unwrap_or(0);
    let histogram = compute_histogram(&all_latencies);

    let rps = if actual_duration_secs > 0.0 {
        total as f64 / actual_duration_secs
    } else {
        0.0
    };

    let error_rate = if total > 0 {
        total_fail as f64 / total as f64 * 100.0
    } else {
        0.0
    };

    let mut timeline = Vec::new();
    let mut peak_rps: f64 = 0.0;
    for (i, bucket) in buckets.iter().enumerate() {
        let reqs = bucket.requests.load(Ordering::Relaxed);
        if reqs == 0 {
            continue;
        }
        let errs = bucket.errors.load(Ordering::Relaxed);
        let lat_sum = bucket.latency_sum.load(Ordering::Relaxed);
        let avg = lat_sum as f64 / reqs as f64;
        if reqs as f64 > peak_rps {
            peak_rps = reqs as f64;
        }
        timeline.push(TimelineBucket {
            second: i as u64,
            requests: reqs,
            errors: errs,
            avg_latency_ms: (avg * 10.0).round() / 10.0,
            rps: reqs as f64,
        });
    }

    Ok(LoadTestResult {
        total_requests: total,
        successful: total_success,
        failed: total_fail,
        avg_latency_ms: (avg_latency * 10.0).round() / 10.0,
        min_latency_ms: min_latency,
        max_latency_ms: max_latency,
        latency_histogram: histogram,
        requests_per_sec: (rps * 10.0).round() / 10.0,
        peak_rps: (peak_rps * 10.0).round() / 10.0,
        error_rate: (error_rate * 10.0).round() / 10.0,
        status_codes: merged_status,
        bytes_received: total_bytes,
        duration_ms: actual_duration_ms,
        timeline,
        errors: merged_errors,
        connection_errors: total_connects,
        timeout_errors: total_timeouts,
        was_cancelled,
    })
}
