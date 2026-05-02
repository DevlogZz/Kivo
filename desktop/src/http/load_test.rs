use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, USER_AGENT};
use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;

const DEFAULT_USER_AGENT: &str = concat!("kivo/", env!("CARGO_PKG_VERSION"));

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadTestPayload {
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
    pub virtual_users: u32,
    pub duration_secs: u32,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
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
    pub p50_latency_ms: u64,
    pub p90_latency_ms: u64,
    pub p99_latency_ms: u64,
    pub requests_per_sec: f64,
    pub error_rate: f64,
    pub status_codes: HashMap<String, u64>,
    pub duration_ms: u64,
    pub errors: Vec<String>,
}

fn build_load_test_headers(headers: &HashMap<String, String>) -> Result<HeaderMap, String> {
    let mut header_map = HeaderMap::new();

    for (key, value) in headers {
        let name = HeaderName::from_bytes(key.as_bytes())
            .map_err(|_| format!("Invalid header name: {key}"))?;
        let header_value =
            HeaderValue::from_str(value).map_err(|_| format!("Invalid header value for: {key}"))?;
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
    let index = ((sorted.len() as f64) * p / 100.0).ceil() as usize;
    sorted[(index.saturating_sub(1)).min(sorted.len() - 1)]
}

#[tauri::command]
pub async fn run_load_test(payload: LoadTestPayload) -> Result<LoadTestResult, String> {
    let virtual_users = payload.virtual_users.clamp(1, 500) as usize;
    let duration_secs = payload.duration_secs.clamp(1, 300) as u64;
    let timeout_ms = payload.timeout_ms.unwrap_or(10_000);

    let url = payload.url.trim().to_string();
    if url.is_empty() {
        return Err("URL is required.".to_string());
    }

    let header_map = build_load_test_headers(&payload.headers)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .default_headers(header_map)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let client = Arc::new(client);
    let semaphore = Arc::new(Semaphore::new(virtual_users));
    let method = payload.method.to_uppercase();
    let body = payload.body.clone();

    let latencies: Arc<tokio::sync::Mutex<Vec<u64>>> =
        Arc::new(tokio::sync::Mutex::new(Vec::new()));
    let status_codes: Arc<tokio::sync::Mutex<HashMap<String, u64>>> =
        Arc::new(tokio::sync::Mutex::new(HashMap::new()));
    let errors: Arc<tokio::sync::Mutex<Vec<String>>> =
        Arc::new(tokio::sync::Mutex::new(Vec::new()));
    let total_requests = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let successful = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let failed = Arc::new(std::sync::atomic::AtomicU64::new(0));

    let test_start = Instant::now();
    let test_deadline = test_start + Duration::from_secs(duration_secs);

    let mut handles = Vec::new();

    for _ in 0..virtual_users {
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

        let handle = tokio::spawn(async move {
            loop {
                if Instant::now() >= test_deadline {
                    break;
                }

                let _permit = match semaphore.clone().acquire_owned().await {
                    Ok(p) => p,
                    Err(_) => break,
                };

                if Instant::now() >= test_deadline {
                    break;
                }

                let req = match method.as_str() {
                    "GET" => client.get(&url),
                    "POST" => {
                        let mut r = client.post(&url);
                        if let Some(ref b) = body {
                            r = r.body(b.clone());
                        }
                        r
                    }
                    "PUT" => {
                        let mut r = client.put(&url);
                        if let Some(ref b) = body {
                            r = r.body(b.clone());
                        }
                        r
                    }
                    "PATCH" => {
                        let mut r = client.patch(&url);
                        if let Some(ref b) = body {
                            r = r.body(b.clone());
                        }
                        r
                    }
                    "DELETE" => client.delete(&url),
                    "HEAD" => client.head(&url),
                    _ => client.get(&url),
                };

                let req_start = Instant::now();
                let result = req.send().await;
                let latency_ms = req_start.elapsed().as_millis() as u64;

                total_requests.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                latencies.lock().await.push(latency_ms);

                match result {
                    Ok(response) => {
                        let code = response.status().as_u16().to_string();
                        if response.status().is_success() {
                            successful.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        } else {
                            failed.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        }
                        *status_codes.lock().await.entry(code).or_insert(0) += 1;
                    }
                    Err(err) => {
                        failed.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        let mut error_list = errors.lock().await;
                        if error_list.len() < 20 {
                            error_list.push(err.to_string());
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

    let actual_duration_ms = test_start.elapsed().as_millis() as u64;
    let actual_duration_secs = actual_duration_ms as f64 / 1000.0;

    let total = total_requests.load(std::sync::atomic::Ordering::Relaxed);
    let success = successful.load(std::sync::atomic::Ordering::Relaxed);
    let fail = failed.load(std::sync::atomic::Ordering::Relaxed);

    let mut sorted_latencies = latencies.lock().await.clone();
    sorted_latencies.sort_unstable();

    let avg_latency = if sorted_latencies.is_empty() {
        0.0
    } else {
        sorted_latencies.iter().sum::<u64>() as f64 / sorted_latencies.len() as f64
    };

    let min_latency = sorted_latencies.first().copied().unwrap_or(0);
    let max_latency = sorted_latencies.last().copied().unwrap_or(0);
    let p50 = percentile(&sorted_latencies, 50.0);
    let p90 = percentile(&sorted_latencies, 90.0);
    let p99 = percentile(&sorted_latencies, 99.0);

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

    let final_status_codes = status_codes.lock().await.clone();
    let final_errors = errors.lock().await.clone();

    Ok(LoadTestResult {
        total_requests: total,
        successful: success,
        failed: fail,
        avg_latency_ms: (avg_latency * 10.0).round() / 10.0,
        min_latency_ms: min_latency,
        max_latency_ms: max_latency,
        p50_latency_ms: p50,
        p90_latency_ms: p90,
        p99_latency_ms: p99,
        requests_per_sec: (rps * 10.0).round() / 10.0,
        error_rate: (error_rate * 10.0).round() / 10.0,
        status_codes: final_status_codes,
        duration_ms: actual_duration_ms,
        errors: final_errors,
    })
}
