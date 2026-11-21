use crate::models::PingResult;
use crate::vpn_manager::AppState;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::task::JoinSet;

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
        // Minimal TLS 1.2/1.3 ClientHello with SNI to measure real handshake RTT
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

    // SNI extension (type 0x0000)
    let mut sni_ext = Vec::with_capacity(9 + sni_len);
    sni_ext.extend_from_slice(&[0x00, 0x00]); // type: server_name
    sni_ext.extend_from_slice(&((sni_len + 5) as u16).to_be_bytes());
    sni_ext.extend_from_slice(&((sni_len + 3) as u16).to_be_bytes());
    sni_ext.push(0x00); // host_name
    sni_ext.extend_from_slice(&(sni_len as u16).to_be_bytes());
    sni_ext.extend_from_slice(sni_bytes);

    let mut body = Vec::new();
    body.extend_from_slice(&[0x03, 0x03]); // TLS 1.2 legacy version
    body.extend_from_slice(&[0x11; 32]); // random
    body.push(0x00); // session id len = 0
    body.extend_from_slice(&[0x00, 0x04, 0x13, 0x01, 0xc0, 0x2f]); // TLS_AES_128_GCM_SHA256 + ECDHE_RSA_AES128_GCM
    body.extend_from_slice(&[0x01, 0x00]); // compression methods: null
    body.extend_from_slice(&(sni_ext.len() as u16).to_be_bytes());
    body.extend_from_slice(&sni_ext);

    let mut handshake = Vec::with_capacity(4 + body.len());
    handshake.push(0x01); // ClientHello
    let len = body.len();
    handshake.push(((len >> 16) & 0xff) as u8);
    handshake.push(((len >> 8) & 0xff) as u8);
    handshake.push((len & 0xff) as u8);
    handshake.extend_from_slice(&body);

    let mut record = Vec::with_capacity(5 + handshake.len());
    record.extend_from_slice(&[0x16, 0x03, 0x01]); // Handshake TLS 1.0 record
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
    let node = {
        let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        guard
            .store
            .servers
            .iter()
            .find(|s| s.id == id)
            .cloned()
            .ok_or_else(|| "Server not found".to_string())?
    };

    let use_tls = node.tls_mode == "tls" || node.tls_mode == "reality";
    let ping_ms = measure_tcp_tls_ping(&node.address, node.port, &node.sni, use_tls).await;
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
    let nodes = {
        let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        guard.store.servers.clone()
    };

    state.push_log(
        Some(&app),
        "Info",
        &format!("Running concurrent TCP/TLS latency probes across {} node(s)...", nodes.len()),
    );

    let mut join_set = JoinSet::new();
    for node in nodes {
        let use_tls = node.tls_mode == "tls" || node.tls_mode == "reality";
        join_set.spawn(async move {
            let ping_ms =
                measure_tcp_tls_ping(&node.address, node.port, &node.sni, use_tls).await;
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
