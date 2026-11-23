use crate::models::{SpeedTestHistoryEntry, SpeedTestProgress};
use crate::tls_probe::resolve_cert_pin_for_node;
use crate::vpn_manager::{resolve_resource_dir, resolve_sidecar_path, AppState};
use crate::xray_config::{build_xray_config_with_overrides, XrayBuildOverrides};
use chrono::Local;
use futures_util::StreamExt;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

struct TempXrayGuard(Option<Child>);
impl Drop for TempXrayGuard {
    fn drop(&mut self) {
        if let Some(mut c) = self.0.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
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

    let proxy = reqwest::Proxy::all(format!("socks5h://127.0.0.1:{socks_port}"))
        .map_err(|e| format!("Failed to build SOCKS5 proxy: {e}"))?;
    let client = reqwest::Client::builder()
        .proxy(proxy)
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build speedtest HTTP client: {e}"))?;

    // PHASE 1: Ping & Jitter (8 lightweight probes to Cloudflare)
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

    let mut rtts: Vec<f64> = Vec::with_capacity(8);
    for idx in 0..8 {
        let t0 = Instant::now();
        let resp = client
            .get("https://speed.cloudflare.com/__down?bytes=0")
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
                progress_pct: 5.0 + ((idx + 1) as f64 / 8.0) * 15.0,
                ping_ms: Some(ms.round() as u64),
                jitter_ms: None,
                download_mbps: None,
                upload_mbps: None,
            },
        );
    }

    let mut sorted = rtts.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median_ping = sorted[sorted.len() / 2].round().max(1.0) as u64;

    let mut diffs = Vec::new();
    for pair in rtts.windows(2) {
        diffs.push((pair[1] - pair[0]).abs());
    }
    let jitter_ms = if diffs.is_empty() {
        0.5
    } else {
        ((diffs.iter().sum::<f64>() / diffs.len() as f64) * 10.0).round() / 10.0
    };

    // PHASE 2: Download (25 MB stream, 150ms progress events)
    let dl_start = Instant::now();
    let dl_resp = client
        .get("https://speed.cloudflare.com/__down?bytes=25000000")
        .send()
        .await
        .map_err(|e| format!("Download speedtest failed: {e}"))?;

    let mut dl_stream = dl_resp.bytes_stream();
    let mut dl_bytes: u64 = 0;
    let mut last_emit = Instant::now();
    let target_dl_bytes: f64 = 25_000_000.0;

    while let Some(chunk) = dl_stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream interrupted: {e}"))?;
        dl_bytes += chunk.len() as u64;

        if last_emit.elapsed() >= Duration::from_millis(150) {
            let secs = dl_start.elapsed().as_secs_f64().max(0.05);
            let mbps = ((dl_bytes as f64 * 8.0) / (secs * 1_000_000.0) * 10.0).round() / 10.0;
            let pct = 20.0 + ((dl_bytes as f64 / target_dl_bytes).min(1.0)) * 45.0;
            let _ = app.emit(
                "speedtest://progress",
                &SpeedTestProgress {
                    phase: "download".into(),
                    mbps,
                    progress_pct: pct,
                    ping_ms: Some(median_ping),
                    jitter_ms: Some(jitter_ms),
                    download_mbps: Some(mbps),
                    upload_mbps: None,
                },
            );
            last_emit = Instant::now();
        }
    }
    let dl_secs = dl_start.elapsed().as_secs_f64().max(0.05);
    let download_mbps = ((dl_bytes as f64 * 8.0) / (dl_secs * 1_000_000.0) * 10.0).round() / 10.0;

    // PHASE 3: Upload (10 MB chunked POST stream, 150ms progress events)
    let total_ul_bytes: usize = 10_000_000;
    let chunk_size: usize = 256 * 1024;
    let payload_chunk = vec![0x55u8; chunk_size];
    let ul_start = Instant::now();
    let app_ul = app.clone();

    let mut sent: usize = 0;
    let mut last_ul_emit = Instant::now();
    let upload_stream = futures_util::stream::poll_fn(move |_cx| {
        if sent >= total_ul_bytes {
            return std::task::Poll::Ready(None);
        }
        let next_len = (total_ul_bytes - sent).min(chunk_size);
        sent += next_len;

        if last_ul_emit.elapsed() >= Duration::from_millis(150) {
            let secs = ul_start.elapsed().as_secs_f64().max(0.05);
            let mbps = ((sent as f64 * 8.0) / (secs * 1_000_000.0) * 10.0).round() / 10.0;
            let pct = 65.0 + ((sent as f64 / total_ul_bytes as f64).min(1.0)) * 35.0;
            let _ = app_ul.emit(
                "speedtest://progress",
                &SpeedTestProgress {
                    phase: "upload".into(),
                    mbps,
                    progress_pct: pct,
                    ping_ms: Some(median_ping),
                    jitter_ms: Some(jitter_ms),
                    download_mbps: Some(download_mbps),
                    upload_mbps: Some(mbps),
                },
            );
            last_ul_emit = Instant::now();
        }

        std::task::Poll::Ready(Some(Ok::<bytes::Bytes, std::io::Error>(
            bytes::Bytes::copy_from_slice(&payload_chunk[..next_len]),
        )))
    });

    let ul_body = reqwest::Body::wrap_stream(upload_stream);
    let ul_resp = client
        .post("https://speed.cloudflare.com/__up")
        .header("content-type", "application/octet-stream")
        .body(ul_body)
        .send()
        .await
        .map_err(|e| format!("Upload speedtest failed: {e}"))?;
    let _ = ul_resp.bytes().await;

    let ul_secs = ul_start.elapsed().as_secs_f64().max(0.05);
    let upload_mbps =
        ((total_ul_bytes as f64 * 8.0) / (ul_secs * 1_000_000.0) * 10.0).round() / 10.0;

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
