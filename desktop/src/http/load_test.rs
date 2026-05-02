use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, USER_AGENT};
use serde::{Deserialize, Serialize};
use tokio::sync::{watch, Semaphore};
use tokio::time::sleep;

const DEFAULT_USER_AGENT: &str = concat!("kivo/", env!("CARGO_PKG_VERSION"));
const MAX_ERRORS: usize = 50;

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

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .default_headers(header_map)
        .redirect(reqwest::redirect::Policy::limited(10))
        .pool_max_idle_per_host(virtual_users.min(512))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let client = Arc::new(client);
    let semaphore = Arc::new(Semaphore::new(virtual_users));
    let method = payload.method.trim().to_uppercase();
    let body = payload.body.filter(|b| !b.trim().is_empty());

    let bucket_count = duration_secs as usize + 2;
    let buckets: Arc<Vec<BucketStats>> = Arc::new((0..bucket_count).map(|_| BucketStats::new()).collect());
    let latencies: Arc<tokio::sync::Mutex<Vec<u64>>> = Arc::new(tokio::sync::Mutex::new(Vec::with_capacity(4096)));
    let status_codes: Arc<tokio::sync::Mutex<HashMap<String, u64>>> = Arc::new(tokio::sync::Mutex::new(HashMap::new()));
    let errors: Arc<tokio::sync::Mutex<Vec<String>>> = Arc::new(tokio::sync::Mutex::new(Vec::new()));
    let total_requests = Arc::new(AtomicU64::new(0));
    let successful = Arc::new(AtomicU64::new(0));
    let failed = Arc::new(AtomicU64::new(0));
    let bytes_received = Arc::new(AtomicU64::new(0));
    let connection_errors = Arc::new(AtomicU64::new(0));
    let timeout_errors = Arc::new(AtomicU64::new(0));

    let test_start = Instant::now();
    let test_deadline = test_start + Duration::from_secs(duration_secs);

    let mut handles = Vec::with_capacity(virtual_users);

    for vu_index in 0..virtual_users {
        let client = Arc::clone(&client);
        let semaphore = Arc::clone(&semaphore);
        let url = url.clone();
        let method = method.clone();
        let body = body.clone();
        let latencies = Arc::clone(&latencies);
        let status_codes = Arc::clone(&status_codes);
        let errors = Arc::clone(&errors);
        let total_requests = Arc::clone(&total_requests);
        let successful = Arc::clone(&successful);
        let failed = Arc::clone(&failed);
        let bytes_received = Arc::clone(&bytes_received);
        let connection_errors = Arc::clone(&connection_errors);
        let timeout_errors = Arc::clone(&timeout_errors);
        let buckets = Arc::clone(&buckets);
        let mut cancel_rx = cancel_rx.clone();

        let ramp_delay_ms = if ramp_up_secs > 0 && virtual_users > 1 {
            (ramp_up_secs * 1000 * vu_index as u64) / (virtual_users as u64).saturating_sub(1)
        } else {
            0
        };

        let handle = tokio::spawn(async move {
            if ramp_delay_ms > 0 {
                tokio::select! {
                    _ = sleep(Duration::from_millis(ramp_delay_ms)) => {}
                    _ = cancel_rx.changed() => { return; }
                }
                if *cancel_rx.borrow() {
                    return;
                }
            }

            loop {
                if *cancel_rx.borrow() || Instant::now() >= test_deadline {
                    break;
                }

                let _permit = tokio::select! {
                    biased;
                    _ = cancel_rx.changed() => break,
                    result = semaphore.clone().acquire_owned() => {
                        match result {
                            Ok(p) => p,
                            Err(_) => break,
                        }
                    }
                };

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
                    result = req_builder.send() => Some(result),
                };

                let Some(result) = outcome else { break };

                let latency_ms = req_start.elapsed().as_millis() as u64;
                let elapsed_secs = test_start.elapsed().as_secs() as usize;
                let bucket_idx = elapsed_secs.min(bucket_count - 1);

                total_requests.fetch_add(1, Ordering::Relaxed);
                latencies.lock().await.push(latency_ms);
                buckets[bucket_idx].requests.fetch_add(1, Ordering::Relaxed);
                buckets[bucket_idx].latency_sum.fetch_add(latency_ms, Ordering::Relaxed);

                match result {
                    Ok(response) => {
                        let status = response.status();
                        let code = status.as_u16().to_string();
                        if status.is_success() {
                            successful.fetch_add(1, Ordering::Relaxed);
                        } else {
                            failed.fetch_add(1, Ordering::Relaxed);
                            buckets[bucket_idx].errors.fetch_add(1, Ordering::Relaxed);
                        }
                        *status_codes.lock().await.entry(code).or_insert(0) += 1;
                        if let Ok(bytes) = response.bytes().await {
                            bytes_received.fetch_add(bytes.len() as u64, Ordering::Relaxed);
                        }
                    }
                    Err(err) => {
                        failed.fetch_add(1, Ordering::Relaxed);
                        buckets[bucket_idx].errors.fetch_add(1, Ordering::Relaxed);
                        if err.is_timeout() {
                            timeout_errors.fetch_add(1, Ordering::Relaxed);
                        } else if err.is_connect() {
                            connection_errors.fetch_add(1, Ordering::Relaxed);
                        }
                        let mut error_list = errors.lock().await;
                        if error_list.len() < MAX_ERRORS {
                            let msg = if err.is_timeout() {
                                format!("[timeout] {err}")
                            } else if err.is_connect() {
                                format!("[connect] {err}")
                            } else {
                                err.to_string()
                            };
                            error_list.push(msg);
                        }
                    }
                }
            }
        });

        handles.push(handle);
    }

    for handle in handles {
        let _ = handle.await;
    }

    let was_cancelled = *cancel_rx.borrow();
    let actual_duration_ms = test_start.elapsed().as_millis() as u64;
    let actual_duration_secs = actual_duration_ms as f64 / 1000.0;

    let total = total_requests.load(Ordering::Relaxed);
    let success = successful.load(Ordering::Relaxed);
    let fail = failed.load(Ordering::Relaxed);

    let mut sorted_latencies = latencies.lock().await.clone();
    sorted_latencies.sort_unstable();

    let avg_latency = if sorted_latencies.is_empty() {
        0.0
    } else {
        sorted_latencies.iter().sum::<u64>() as f64 / sorted_latencies.len() as f64
    };

    let min_latency = sorted_latencies.first().copied().unwrap_or(0);
    let max_latency = sorted_latencies.last().copied().unwrap_or(0);
    let histogram = compute_histogram(&sorted_latencies);

    let rps = if actual_duration_secs > 0.0 {
        total as f64 / actual_duration_secs
    } else {
        0.0
    };

    let error_rate = if total > 0 {
        fail as f64 / total as f64 * 100.0
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

    let final_status_codes = status_codes.lock().await.clone();
    let final_errors = errors.lock().await.clone();

    Ok(LoadTestResult {
        total_requests: total,
        successful: success,
        failed: fail,
        avg_latency_ms: (avg_latency * 10.0).round() / 10.0,
        min_latency_ms: min_latency,
        max_latency_ms: max_latency,
        latency_histogram: histogram,
        requests_per_sec: (rps * 10.0).round() / 10.0,
        peak_rps: (peak_rps * 10.0).round() / 10.0,
        error_rate: (error_rate * 10.0).round() / 10.0,
        status_codes: final_status_codes,
        bytes_received: bytes_received.load(Ordering::Relaxed),
        duration_ms: actual_duration_ms,
        timeline,
        errors: final_errors,
        connection_errors: connection_errors.load(Ordering::Relaxed),
        timeout_errors: timeout_errors.load(Ordering::Relaxed),
        was_cancelled,
    })
}
