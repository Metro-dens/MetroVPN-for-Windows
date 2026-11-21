use crate::models::{AppSettings, PingResult, ServerNode};
use crate::vpn_manager::{resolve_resource_dir, resolve_sidecar_path, AppState};
use crate::xray_config::build_xray_config;
use std::net::TcpListener;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use uuid::Uuid;

struct TempPingXrayGuard(Option<Child>, std::path::PathBuf);
impl Drop for TempPingXrayGuard {
    fn drop(&mut self) {
        if let Some(mut c) = self.0.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
        let _ = std::fs::remove_file(&self.1);
    }
}

fn find_two_free_ports() -> Option<(u16, u16)> {
    let l1 = TcpListener::bind("127.0.0.1:0").ok()?;
    let p1 = l1.local_addr().ok()?.port();
    let l2 = TcpListener::bind("127.0.0.1:0").ok()?;
    let p2 = l2.local_addr().ok()?.port();
    Some((p1, p2))
}

async fn measure_http_204_ping(
    xray_bin: &Path,
    res_dir: &Path,
    app_data_dir: &Path,
    node: &ServerNode,
    settings: &AppSettings,
) -> Option<u64> {
    let (socks_port, http_port) = find_two_free_ports()?;
    let cfg = build_xray_config(node, settings, socks_port, http_port, false);
    let cfg_path = app_data_dir.join(format!("ping-{}.json", Uuid::new_v4().simple()));
    let json = serde_json::to_string(&cfg).ok()?;
    std::fs::write(&cfg_path, json).ok()?;

    let mut cmd = Command::new(xray_bin);
    cmd.args(["run", "-c", &cfg_path.to_string_lossy()])
        .env("XRAY_LOCATION_ASSET", res_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(crate::network_win::CREATE_NO_WINDOW);
    }

    let child = cmd.spawn().ok()?;
    let guard_path = cfg_path.clone();
    let _guard = TempPingXrayGuard(Some(child), guard_path);

    // Wait briefly until local test SOCKS5 port accepts connections (up to 900ms)
    let mut ready = false;
    for _ in 0..18 {
        if TcpStream::connect(("127.0.0.1", socks_port)).await.is_ok() {
            ready = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    if !ready {
        return None;
    }

    let test_url = if settings.latency_test_url.trim().is_empty() {
        "https://www.gstatic.com/generate_204"
    } else {
        settings.latency_test_url.trim()
    };

    let proxy = reqwest::Proxy::all(format!("socks5h://127.0.0.1:{socks_port}")).ok()?;
    let client = reqwest::Client::builder()
        .proxy(proxy)
        .timeout(Duration::from_millis(4500))
        .build()
        .ok()?;

    let start = Instant::now();
    let resp = client.get(test_url).send().await.ok()?;
    let status = resp.status().as_u16();
    if status == 204 || (200..400).contains(&status) {
        Some(start.elapsed().as_millis().max(1) as u64)
    } else {
        None
    }
}

async fn measure_tcp_tls_ping(address: &str, port: u16, sni: &str, use_tls_probe: bool) -> Option<u64> {
    let target = format!("{address}:{port}");
    let start = Instant::now();

    let mut stream = match tokio::time::timeout(
        Duration::from_millis(3000),
        TcpStream::connect(&target),
    )
    .await
    {
        Ok(Ok(s)) => s,
        _ => return None,
    };

    if use_tls_probe && !sni.is_empty() {
        let hello = build_minimal_client_hello(sni);
        if tokio::time::timeout(Duration::from_millis(2000), stream.write_all(&hello))
            .await
            .is_ok()
        {
            let mut buf = [0u8; 5];
            let _ = tokio::time::timeout(Duration::from_millis(2000), stream.read(&mut buf)).await;
        }
    }

    Some(start.elapsed().as_millis().max(1) as u64)
}

fn build_minimal_client_hello(sni: &str) -> Vec<u8> {
    let sni_bytes = sni.as_bytes();
    let sni_len = sni_bytes.len();

    let mut sni_ext = Vec::with_capacity(9 + sni_len);
    sni_ext.extend_from_slice(&[0x00, 0x00]);
    sni_ext.extend_from_slice(&((sni_len + 5) as u16).to_be_bytes());
    sni_ext.extend_from_slice(&((sni_len + 3) as u16).to_be_bytes());
    sni_ext.push(0x00);
    sni_ext.extend_from_slice(&(sni_len as u16).to_be_bytes());
    sni_ext.extend_from_slice(sni_bytes);

    let mut body = Vec::new();
    body.extend_from_slice(&[0x03, 0x03]);
    body.extend_from_slice(&[0x11; 32]);
    body.push(0x00);
    body.extend_from_slice(&[0x00, 0x04, 0x13, 0x01, 0xc0, 0x2f]);
    body.extend_from_slice(&[0x01, 0x00]);
    body.extend_from_slice(&(sni_ext.len() as u16).to_be_bytes());
    body.extend_from_slice(&sni_ext);

    let mut handshake = Vec::with_capacity(4 + body.len());
    handshake.push(0x01);
    let len = body.len();
    handshake.push(((len >> 16) & 0xff) as u8);
    handshake.push(((len >> 8) & 0xff) as u8);
    handshake.push((len & 0xff) as u8);
    handshake.extend_from_slice(&body);

    let mut record = Vec::with_capacity(5 + handshake.len());
    record.extend_from_slice(&[0x16, 0x03, 0x01]);
    record.extend_from_slice(&(handshake.len() as u16).to_be_bytes());
    record.extend_from_slice(&handshake);
    record
}

#[tauri::command]
pub async fn ping_server(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<PingResult, String> {
    let (node, settings, app_data_dir) = {
        let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        let n = guard
            .store
            .servers
            .iter()
            .find(|s| s.id == id)
            .cloned()
            .ok_or_else(|| "Server not found".to_string())?;
        (n, guard.store.settings.clone(), guard.app_data_dir.clone())
    };

    let ping_ms = if settings.latency_mode == "http_204" {
        if let Ok(xray_bin) = resolve_sidecar_path(&app, "xray") {
            let res_dir = resolve_resource_dir(&app);
            measure_http_204_ping(&xray_bin, &res_dir, &app_data_dir, &node, &settings).await
        } else {
            let use_tls = node.tls_mode == "tls" || node.tls_mode == "reality";
            measure_tcp_tls_ping(&node.address, node.port, &node.sni, use_tls).await
        }
    } else {
        let use_tls = node.tls_mode == "tls" || node.tls_mode == "reality";
        measure_tcp_tls_ping(&node.address, node.port, &node.sni, use_tls).await
    };

    let res = PingResult {
        id: node.id.clone(),
        ping_ms,
        online: ping_ms.is_some(),
    };

    {
        let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        if let Some(s) = guard.store.servers.iter_mut().find(|s| s.id == id) {
            s.ping = res.ping_ms;
            s.online = res.online;
        }
    }
    state.persist();
    let _ = app.emit("vpn://ping-updated", &res);
    Ok(res)
}

#[tauri::command]
pub async fn ping_all_servers(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<PingResult>, String> {
    let (nodes, settings, app_data_dir) = {
        let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        (
            guard.store.servers.clone(),
            guard.store.settings.clone(),
            guard.app_data_dir.clone(),
        )
    };

    let mode_label = if settings.latency_mode == "http_204" {
        "Real HTTP 204 Delay (via Xray)"
    } else {
        "TCP/TLS Handshake"
    };
    state.push_log(
        Some(&app),
        "Info",
        &format!("Running concurrent {mode_label} probes across {} node(s)...", nodes.len()),
    );

    let xray_bin_opt = resolve_sidecar_path(&app, "xray").ok();
    let res_dir = resolve_resource_dir(&app);
    let sem = Arc::new(Semaphore::new(6));
    let mut join_set = JoinSet::new();

    for node in nodes {
        let permit_sem = sem.clone();
        let st_copy = settings.clone();
        let data_dir = app_data_dir.clone();
        let xbin = xray_bin_opt.clone();
        let rdir = res_dir.clone();

        join_set.spawn(async move {
            let _permit = permit_sem.acquire().await.ok();
            let ping_ms = if st_copy.latency_mode == "http_204" {
                if let Some(bin) = &xbin {
                    measure_http_204_ping(bin, &rdir, &data_dir, &node, &st_copy).await
                } else {
                    let use_tls = node.tls_mode == "tls" || node.tls_mode == "reality";
                    measure_tcp_tls_ping(&node.address, node.port, &node.sni, use_tls).await
                }
            } else {
                let use_tls = node.tls_mode == "tls" || node.tls_mode == "reality";
                measure_tcp_tls_ping(&node.address, node.port, &node.sni, use_tls).await
            };
            PingResult {
                id: node.id,
                ping_ms,
                online: ping_ms.is_some(),
            }
        });
    }

    let mut results = Vec::new();
    while let Some(joined) = join_set.join_next().await {
        if let Ok(res) = joined {
            {
                let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
                if let Some(s) = guard.store.servers.iter_mut().find(|s| s.id == res.id) {
                    s.ping = res.ping_ms;
                    s.online = res.online;
                }
            }
            let _ = app.emit("vpn://ping-updated", &res);
            results.push(res);
        }
    }

    state.persist();
    Ok(results)
}
