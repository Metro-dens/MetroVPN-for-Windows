use crate::models::{SpeedTestHistoryEntry, SpeedTestProgress};
use crate::tls_probe::resolve_cert_pin_for_node;
use crate::vpn_manager::{resolve_resource_dir, resolve_sidecar_path, AppState};
use crate::xray_config::{build_xray_config_with_overrides, XrayBuildOverrides};
use bytes::Bytes;
use chrono::Local;
use futures_util::StreamExt;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

const DOWNLOAD_STREAMS: usize = 8;
const UPLOAD_STREAMS: usize = 6;
const DOWNLOAD_DURATION_SECS: f64 = 7.0;
const UPLOAD_DURATION_SECS: f64 = 6.0;
const WARMUP_SECS: f64 = 1.5;
const SAMPLE_INTERVAL_MS: u64 = 200;

struct TempXrayGuard(Option<Child>);
impl Drop for TempXrayGuard {
    fn drop(&mut self) {
        if let Some(mut c) = self.0.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

fn build_worker_client(socks_port: u16, timeout_secs: u64) -> Result<reqwest::Client, String> {
    let proxy = reqwest::Proxy::all(format!("socks5h://127.0.0.1:{socks_port}"))
        .map_err(|e| format!("Failed to build SOCKS5 proxy: {e}"))?;
    reqwest::Client::builder()
        .proxy(proxy)
        .http1_only()
        .tcp_nodelay(true)
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("Failed to build speedtest HTTP client: {e}"))
}

/// Computes trimmed steady-state Mbps from 200ms interval samples (Ookla-style):
/// drops the lowest `drop_low_pct` (slow-start / transient dips) and highest
/// `drop_high_pct` (initial socket-buffer bursts) before averaging.
fn compute_trimmed_mbps(samples: &[f64], drop_low_pct: f64, drop_high_pct: f64) -> Option<f64> {
    let mut valid: Vec<f64> = samples
        .iter()
        .copied()
        .filter(|v| v.is_finite() && *v > 0.05)
        .collect();
    if valid.is_empty() {
        return None;
    }
    valid.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = valid.len();
    let low_idx = ((n as f64) * drop_low_pct).floor() as usize;
    let high_drop = ((n as f64) * drop_high_pct).floor() as usize;
    let end_idx = n.saturating_sub(high_drop).max(low_idx + 1).min(n);
    let slice = &valid[low_idx.min(end_idx - 1)..end_idx];
    let avg = slice.iter().sum::<f64>() / (slice.len() as f64);
    Some((avg * 10.0).round() / 10.0)
}

#[tauri::command]
pub async fn get_speed_history(
    state: State<'_, AppState>,
) -> Result<Vec<SpeedTestHistoryEntry>, String> {
    let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
    Ok(guard.store.speed_history.clone())
}

#[tauri::command]
pub async fn clear_speed_history(state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        guard.store.speed_history.clear();
    }
    state.persist();
    Ok(())
}

#[tauri::command]
pub async fn run_speed_test(
    app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
) -> Result<SpeedTestHistoryEntry, String> {
    let (is_connected_to_target, target_node, settings, app_data_dir) = {
        let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        let target = guard
            .store
            .servers
            .iter()
            .find(|s| s.id == server_id)
            .cloned()
            .ok_or_else(|| "Selected test server not found".to_string())?;
        let connected_same = guard.status == "Connected"
            && guard.store.settings.active_node_id.as_deref() == Some(server_id.as_str());
        (
            connected_same,
            target,
            guard.store.settings.clone(),
            guard.app_data_dir.clone(),
        )
    };

    let (_temp_guard, socks_port) = if is_connected_to_target {
        (TempXrayGuard(None), settings.socks_port.max(1024))
    } else {
        let test_socks = std::net::TcpListener::bind("127.0.0.1:0")
            .ok()
            .and_then(|l| l.local_addr().ok())
            .map(|a| a.port())
            .unwrap_or(10818);
        let test_http = std::net::TcpListener::bind("127.0.0.1:0")
            .ok()
            .and_then(|l| l.local_addr().ok())
            .map(|a| a.port())
            .unwrap_or(10819);
        let cert_pin = resolve_cert_pin_for_node(&target_node, &settings, None).await;
        let cfg = build_xray_config_with_overrides(
            &target_node,
            &settings,
            test_socks,
            test_http,
            false,
            XrayBuildOverrides {
                dial_ip_override: None,
                cert_pin_override: cert_pin.as_deref(),
            },
        );
        let cfg_path = app_data_dir.join("xray-speedtest.json");
        let json = serde_json::to_string_pretty(&cfg)
            .map_err(|e| format!("Failed to serialize speedtest config: {e}"))?;
        std::fs::write(&cfg_path, json)
            .map_err(|e| format!("Failed to write speedtest config: {e}"))?;

        let xray_bin = resolve_sidecar_path(&app, "xray")?;
        let res_dir = resolve_resource_dir(&app);
        let mut cmd = Command::new(&xray_bin);
        cmd.args(["run", "-c", &cfg_path.to_string_lossy()])
            .env("XRAY_LOCATION_ASSET", &res_dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(crate::network_win::CREATE_NO_WINDOW);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start temporary Xray speedtest core: {e}"))?;

        let mut ready = false;
        for _ in 0..40 {
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!("Temporary Xray speedtest core exited early ({status})"));
            }
            if tokio::net::TcpStream::connect(("127.0.0.1", test_socks))
                .await
                .is_ok()
            {
                ready = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(60)).await;
        }
        if !ready {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Temporary Xray speedtest core timed out opening local SOCKS5 port".into());
        }
        (TempXrayGuard(Some(child)), test_socks)
    };

    // =========================================================================
    // PHASE 1: Ping & Jitter (2 warm-up requests discarded + 10 warm keep-alive probes)
    // =========================================================================
    let _ = app.emit(
        "speedtest://progress",
        &SpeedTestProgress {
            phase: "ping".into(),
            mbps: 0.0,
            progress_pct: 5.0,
            ping_ms: None,
            jitter_ms: None,
            download_mbps: None,
            upload_mbps: None,
        },
    );

    let ping_client = build_worker_client(socks_port, 12)?;
    // Warm up the TLS + SOCKS5 keep-alive socket so cold handshake latency isn't counted as RTT
    for _ in 0..2 {
        let resp = ping_client
            .get("https://speed.cloudflare.com/__down?bytes=0")
            .header("Connection", "keep-alive")
            .send()
            .await
            .map_err(|e| format!("Ping warm-up failed through Xray tunnel: {e}"))?;
        let _ = resp.bytes().await;
    }

    let mut rtts: Vec<f64> = Vec::with_capacity(10);
    for idx in 0..10 {
        let t0 = Instant::now();
        let resp = ping_client
            .get("https://speed.cloudflare.com/__down?bytes=0")
            .header("Connection", "keep-alive")
            .send()
            .await
            .map_err(|e| format!("Ping probe failed through Xray tunnel: {e}"))?;
        let _ = resp.bytes().await;
        let ms = t0.elapsed().as_secs_f64() * 1000.0;
        rtts.push(ms);

        let _ = app.emit(
            "speedtest://progress",
            &SpeedTestProgress {
                phase: "ping".into(),
                mbps: 0.0,
                progress_pct: 5.0 + ((idx + 1) as f64 / 10.0) * 15.0,
                ping_ms: Some(ms.round().max(1.0) as u64),
                jitter_ms: None,
                download_mbps: None,
                upload_mbps: None,
            },
        );
    }

    let mut sorted_rtts = rtts.clone();
    sorted_rtts.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    // Ookla-style low-percentile RTT (25th percentile) filters transient scheduling jitter
    let p25_idx = (sorted_rtts.len() / 4).min(sorted_rtts.len().saturating_sub(1));
    let median_ping = sorted_rtts[p25_idx].round().max(1.0) as u64;
    let median_val = sorted_rtts[sorted_rtts.len() / 2].max(1.0);

    let mut diffs: Vec<f64> = rtts
        .windows(2)
        .map(|pair| (pair[1] - pair[0]).abs())
        .filter(|d| *d <= median_val * 2.5)
        .collect();
    if diffs.is_empty() {
        diffs = rtts.windows(2).map(|pair| (pair[1] - pair[0]).abs()).collect();
    }
    let jitter_ms = if diffs.is_empty() {
        0.5
    } else {
        ((diffs.iter().sum::<f64>() / diffs.len() as f64) * 10.0).round() / 10.0
    };

    // =========================================================================
    // PHASE 2: Multi-Connection Sustained Download (8 independent TCP/HTTP1.1 streams, 7.0s)
    // =========================================================================
    let dl_total_bytes = Arc::new(AtomicU64::new(0));
    let dl_cancel = Arc::new(AtomicBool::new(false));
    let mut dl_handles = Vec::with_capacity(DOWNLOAD_STREAMS);

    for worker_idx in 0..DOWNLOAD_STREAMS {
        let client = build_worker_client(socks_port, 20)?;
        let counter = dl_total_bytes.clone();
        let cancel = dl_cancel.clone();
        dl_handles.push(tokio::spawn(async move {
            let mut seq: u64 = 0;
            while !cancel.load(Ordering::Relaxed) {
                seq = seq.wrapping_add(1);
                let url = format!(
                    "https://speed.cloudflare.com/__down?bytes=50000000&w={worker_idx}&s={seq}"
                );
                let resp = match client
                    .get(&url)
                    .header("Cache-Control", "no-store")
                    .send()
                    .await
                {
                    Ok(r) if r.status().is_success() => r,
                    _ => {
                        if cancel.load(Ordering::Relaxed) {
                            break;
                        }
                        tokio::time::sleep(Duration::from_millis(80)).await;
                        continue;
                    }
                };
                let mut stream = resp.bytes_stream();
                while let Some(chunk_res) = stream.next().await {
                    if cancel.load(Ordering::Relaxed) {
                        break;
                    }
                    match chunk_res {
                        Ok(chunk) => {
                            counter.fetch_add(chunk.len() as u64, Ordering::Relaxed);
                        }
                        Err(_) => break,
                    }
                }
            }
        }));
    }

    let dl_start = Instant::now();
    let mut prev_dl_bytes: u64 = 0;
    let mut prev_dl_time = dl_start;
    let mut dl_steady_samples: Vec<f64> = Vec::with_capacity(40);
    let mut smoothed_dl_mbps: f64 = 0.0;

    let mut ticker = tokio::time::interval(Duration::from_millis(SAMPLE_INTERVAL_MS));
    ticker.tick().await; // consume immediate 0ms tick
    while dl_start.elapsed().as_secs_f64() < DOWNLOAD_DURATION_SECS {
        ticker.tick().await;
        let now = Instant::now();
        let total_now = dl_total_bytes.load(Ordering::Relaxed);
        let delta_bytes = total_now.saturating_sub(prev_dl_bytes);
        let dt = now.duration_since(prev_dl_time).as_secs_f64().max(0.05);
        prev_dl_bytes = total_now;
        prev_dl_time = now;

        let inst_mbps = (delta_bytes as f64 * 8.0) / (dt * 1_000_000.0);
        let elapsed = dl_start.elapsed().as_secs_f64();
        if elapsed >= WARMUP_SECS && inst_mbps > 0.05 {
            dl_steady_samples.push(inst_mbps);
        }

        smoothed_dl_mbps = if smoothed_dl_mbps <= 0.01 {
            inst_mbps
        } else {
            smoothed_dl_mbps * 0.45 + inst_mbps * 0.55
        };
        let display_mbps = (smoothed_dl_mbps * 10.0).round() / 10.0;
        let pct = 20.0 + ((elapsed / DOWNLOAD_DURATION_SECS).min(1.0)) * 45.0;

        let _ = app.emit(
            "speedtest://progress",
            &SpeedTestProgress {
                phase: "download".into(),
                mbps: display_mbps,
                progress_pct: pct,
                ping_ms: Some(median_ping),
                jitter_ms: Some(jitter_ms),
                download_mbps: Some(display_mbps),
                upload_mbps: None,
            },
        );
    }

    dl_cancel.store(true, Ordering::Relaxed);
    for h in dl_handles {
        h.abort();
    }

    let dl_bytes_final = dl_total_bytes.load(Ordering::Relaxed);
    if dl_bytes_final == 0 {
        return Err("Download speedtest received 0 bytes through Xray tunnel".into());
    }
    let dl_secs_total = dl_start.elapsed().as_secs_f64().max(0.2);
    let dl_fallback_mbps =
        ((dl_bytes_final as f64 * 8.0) / (dl_secs_total * 1_000_000.0) * 10.0).round() / 10.0;
    // Trim lowest 30% slow-start/dip intervals and top 5% spikes (Ookla/Fast.com methodology)
    let download_mbps =
        compute_trimmed_mbps(&dl_steady_samples, 0.30, 0.05).unwrap_or(dl_fallback_mbps);

    // =========================================================================
    // PHASE 3: Multi-Connection Sustained Upload (6 independent TCP/HTTP1.1 streams, 6.0s)
    // =========================================================================
    let ul_total_bytes = Arc::new(AtomicU64::new(0));
    let ul_cancel = Arc::new(AtomicBool::new(false));
    let shared_chunk = Bytes::from(vec![0x55u8; 256 * 1024]); // zero-copy O(1) clone per chunk
    let mut ul_handles = Vec::with_capacity(UPLOAD_STREAMS);

    for _ in 0..UPLOAD_STREAMS {
        let client = build_worker_client(socks_port, 20)?;
        let counter = ul_total_bytes.clone();
        let cancel = ul_cancel.clone();
        let chunk_template = shared_chunk.clone();
        ul_handles.push(tokio::spawn(async move {
            const PER_POST_BYTES: usize = 16 * 1024 * 1024;
            const BUFFER_PREFILL_SKIP: usize = 512 * 1024;
            while !cancel.load(Ordering::Relaxed) {
                let mut sent_this_req: usize = 0;
                let c_inner = counter.clone();
                let cancel_inner = cancel.clone();
                let chunk_ref = chunk_template.clone();

                let upload_stream = futures_util::stream::poll_fn(move |_cx| {
                    if cancel_inner.load(Ordering::Relaxed) || sent_this_req >= PER_POST_BYTES {
                        return std::task::Poll::Ready(None);
                    }
                    let remaining = PER_POST_BYTES - sent_this_req;
                    let len = remaining.min(chunk_ref.len());
                    let prev_sent = sent_this_req;
                    sent_this_req += len;

                    // Skip initial 512 KB kernel TCP send-buffer fill before counting wire throughput
                    if sent_this_req > BUFFER_PREFILL_SKIP {
                        let countable = if prev_sent >= BUFFER_PREFILL_SKIP {
                            len
                        } else {
                            sent_this_req - BUFFER_PREFILL_SKIP
                        };
                        c_inner.fetch_add(countable as u64, Ordering::Relaxed);
                    }

                    let payload = if len == chunk_ref.len() {
                        chunk_ref.clone()
                    } else {
                        chunk_ref.slice(0..len)
                    };
                    std::task::Poll::Ready(Some(Ok::<Bytes, std::io::Error>(payload)))
                });

                let body = reqwest::Body::wrap_stream(upload_stream);
                match client
                    .post("https://speed.cloudflare.com/__up")
                    .header("content-type", "application/octet-stream")
                    .body(body)
                    .send()
                    .await
                {
                    Ok(r) => {
                        let _ = r.bytes().await;
                    }
                    Err(_) => {
                        if cancel.load(Ordering::Relaxed) {
                            break;
                        }
                        tokio::time::sleep(Duration::from_millis(80)).await;
                    }
                }
            }
        }));
    }

    let ul_start = Instant::now();
    let mut prev_ul_bytes: u64 = 0;
    let mut prev_ul_time = ul_start;
    let mut ul_steady_samples: Vec<f64> = Vec::with_capacity(35);
    let mut smoothed_ul_mbps: f64 = 0.0;

    let mut ul_ticker = tokio::time::interval(Duration::from_millis(SAMPLE_INTERVAL_MS));
    ul_ticker.tick().await;
    while ul_start.elapsed().as_secs_f64() < UPLOAD_DURATION_SECS {
        ul_ticker.tick().await;
        let now = Instant::now();
        let total_now = ul_total_bytes.load(Ordering::Relaxed);
        let delta_bytes = total_now.saturating_sub(prev_ul_bytes);
        let dt = now.duration_since(prev_ul_time).as_secs_f64().max(0.05);
        prev_ul_bytes = total_now;
        prev_ul_time = now;

        let inst_mbps = (delta_bytes as f64 * 8.0) / (dt * 1_000_000.0);
        let elapsed = ul_start.elapsed().as_secs_f64();
        if elapsed >= WARMUP_SECS && inst_mbps > 0.05 {
            ul_steady_samples.push(inst_mbps);
        }

        smoothed_ul_mbps = if smoothed_ul_mbps <= 0.01 {
            inst_mbps
        } else {
            smoothed_ul_mbps * 0.45 + inst_mbps * 0.55
        };
        let display_mbps = (smoothed_ul_mbps * 10.0).round() / 10.0;
        let pct = 65.0 + ((elapsed / UPLOAD_DURATION_SECS).min(1.0)) * 35.0;

        let _ = app.emit(
            "speedtest://progress",
            &SpeedTestProgress {
                phase: "upload".into(),
                mbps: display_mbps,
                progress_pct: pct,
                ping_ms: Some(median_ping),
                jitter_ms: Some(jitter_ms),
                download_mbps: Some(download_mbps),
                upload_mbps: Some(display_mbps),
            },
        );
    }

    ul_cancel.store(true, Ordering::Relaxed);
    for h in ul_handles {
        h.abort();
    }

    let ul_bytes_final = ul_total_bytes.load(Ordering::Relaxed);
    let ul_secs_total = ul_start.elapsed().as_secs_f64().max(0.2);
    let ul_fallback_mbps =
        ((ul_bytes_final as f64 * 8.0) / (ul_secs_total * 1_000_000.0) * 10.0).round() / 10.0;
    // Trim lowest 25% and highest 10% (filters residual socket-buffer spikes)
    let upload_mbps =
        compute_trimmed_mbps(&ul_steady_samples, 0.25, 0.10).unwrap_or(ul_fallback_mbps);

    let entry = SpeedTestHistoryEntry {
        id: format!("h-{}", Uuid::new_v4().simple()),
        server_name: target_node.name.clone(),
        timestamp: Local::now().format("Today, %H:%M").to_string(),
        ping: median_ping,
        jitter: jitter_ms,
        download: download_mbps,
        upload: upload_mbps,
    };

    {
        let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        guard.store.speed_history.insert(0, entry.clone());
        guard.store.speed_history.truncate(10);
    }
    state.persist();

    let _ = app.emit(
        "speedtest://progress",
        &SpeedTestProgress {
            phase: "complete".into(),
            mbps: download_mbps,
            progress_pct: 100.0,
            ping_ms: Some(median_ping),
            jitter_ms: Some(jitter_ms),
            download_mbps: Some(download_mbps),
            upload_mbps: Some(upload_mbps),
        },
    );

    Ok(entry)
}
