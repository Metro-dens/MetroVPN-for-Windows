use crate::models::{
    AppSettings, LogEntry, PersistedStore, ReleaseUpdateInfo, ServerNode, TelemetryPayload,
    VpnStatusPayload, WindowsAppRule,
};
use crate::network_win::{
    backup_file_path, configure_tun_interface, enable_system_proxy, get_active_lan_ipv4,
    is_elevated, relaunch_as_admin, restore_system_proxy, teardown_tun_routes, CREATE_NO_WINDOW,
};
use crate::parser::{decode_qr_from_bytes, fetch_subscription, parse_any};
use crate::xray_config::{build_xray_config, STATS_API_PORT};
use crate::xray_stats::query_xray_stats;
use chrono::Local;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const MAX_LOG_LINES: usize = 500;

pub struct InnerState {
    pub app_data_dir: PathBuf,
    pub store_path: PathBuf,
    pub store: PersistedStore,
    pub xray_child: Option<Child>,
    pub tun_child: Option<Child>,
    pub status: String, // "Disconnected" | "Connecting" | "Connected" | "Error"
    pub error_message: Option<String>,
    pub connected_at: Option<Instant>,
    pub pinned_server_ips: Vec<String>,
    pub logs: VecDeque<LogEntry>,
    pub telemetry_generation: u64,
    pub last_up_bytes: u64,
    pub last_down_bytes: u64,
}

#[derive(Clone)]
pub struct AppState {
    pub inner: Arc<Mutex<InnerState>>,
}

impl AppState {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&app_data_dir);
        #[cfg(feature = "standalone-exe")]
        ensure_standalone_core(&app_data_dir);
        let store_path = app_data_dir.join("metrovpn_store.json");

        // Crash recovery: restore Windows proxy registry if an old lock file survived
        let backup_path = backup_file_path(&app_data_dir);
        let recovered = restore_system_proxy(&backup_path).unwrap_or(false);

        let mut store = load_store(&store_path);
        if store.servers.is_empty() && store.settings.active_node_id.is_some() {
            store.settings.active_node_id = None;
            save_store(&store_path, &store);
        }

        let mut logs = VecDeque::with_capacity(MAX_LOG_LINES);
        if recovered {
            logs.push_back(make_log(
                "Warning",
                "Recovered Windows System Proxy settings from a previous unclean exit",
            ));
        }
        logs.push_back(make_log(
            "Info",
            "Metrovpn Desktop engine ready (Xray-core v26.11.9)",
        ));

        Self {
            inner: Arc::new(Mutex::new(InnerState {
                app_data_dir,
                store_path,
                store,
                xray_child: None,
                tun_child: None,
                status: "Disconnected".into(),
                error_message: None,
                connected_at: None,
                pinned_server_ips: Vec::new(),
                logs,
                telemetry_generation: 0,
                last_up_bytes: 0,
                last_down_bytes: 0,
            })),
        }
    }

    pub fn persist(&self) {
        if let Ok(guard) = self.inner.lock() {
            save_store(&guard.store_path, &guard.store);
        }
    }

    pub fn push_log(&self, app: Option<&AppHandle>, tag: &str, msg: &str) {
        let entry = make_log(tag, msg);
        if let Ok(mut guard) = self.inner.lock() {
            if guard.logs.len() >= MAX_LOG_LINES {
                guard.logs.pop_front();
            }
            guard.logs.push_back(entry.clone());
        }
        if let Some(handle) = app {
            let _ = handle.emit("vpn://log", &entry);
        }
    }

    pub fn cleanup_all(&self) {
        let (xray_child, tun_child, pinned_ips, backup_path) = {
            let Ok(mut guard) = self.inner.lock() else {
                return;
            };
            guard.telemetry_generation = guard.telemetry_generation.wrapping_add(1);
            guard.status = "Disconnected".into();
            guard.connected_at = None;
            (
                guard.xray_child.take(),
                guard.tun_child.take(),
                std::mem::take(&mut guard.pinned_server_ips),
                backup_file_path(&guard.app_data_dir),
            )
        };

        if let Some(mut child) = tun_child {
            let _ = child.kill();
            let _ = child.wait();
        }
        teardown_tun_routes(&pinned_ips);

        if let Some(mut child) = xray_child {
            let _ = child.kill();
            let _ = child.wait();
        }

        let _ = restore_system_proxy(&backup_path);
    }
}

pub fn make_log(tag: &str, msg: &str) -> LogEntry {
    LogEntry {
        id: format!("l-{}", Uuid::new_v4().simple()),
        time: Local::now().format("%H:%M:%S").to_string(),
        tag: tag.to_string(),
        msg: msg.to_string(),
    }
}

fn load_store(path: &Path) -> PersistedStore {
    if let Ok(raw) = std::fs::read_to_string(path) {
        if let Ok(parsed) = serde_json::from_str::<PersistedStore>(&raw) {
            return parsed;
        }
    }
    PersistedStore::default()
}

fn save_store(path: &Path, store: &PersistedStore) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(store) {
        let _ = std::fs::write(path, json);
    }
}

pub fn resolve_sidecar_path(app: &AppHandle, base_name: &str) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("Cannot resolve exe path: {e}"))?;
    let exe_dir = exe
        .parent()
        .ok_or_else(|| "Cannot resolve exe directory".to_string())?;

    let candidates = [
        exe_dir.join(format!("{base_name}.exe")),
        exe_dir.join(format!("{base_name}-x86_64-pc-windows-msvc.exe")),
        exe_dir.join(format!("binaries/{base_name}.exe")),
        exe_dir.join(format!("binaries/{base_name}-x86_64-pc-windows-msvc.exe")),
        exe_dir.join(base_name),
    ];

    for c in &candidates {
        if c.exists() {
            return Ok(c.clone());
        }
    }

    if let Ok(res_dir) = app.path().resource_dir() {
        let r_candidates = [
            res_dir.join(format!("{base_name}.exe")),
            res_dir.join(format!("binaries/{base_name}-x86_64-pc-windows-msvc.exe")),
        ];
        for c in &r_candidates {
            if c.exists() {
                return Ok(c.clone());
            }
        }
    }

    if let Ok(data_dir) = app.path().app_data_dir() {
        let core_candidate = data_dir.join("core").join(format!("{base_name}.exe"));
        if core_candidate.exists() {
            return Ok(core_candidate);
        }
    }

    Err(format!(
        "Sidecar binary '{base_name}.exe' not found next to application executable"
    ))
}

pub fn resolve_resource_dir(app: &AppHandle) -> PathBuf {
    if let Ok(res_dir) = app.path().resource_dir() {
        if res_dir.join("resources").join("wintun.dll").exists() {
            return res_dir.join("resources");
        }
        if res_dir.join("wintun.dll").exists() || res_dir.join("geoip.dat").exists() {
            return res_dir;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if dir.join("resources").exists() {
                return dir.join("resources");
            }
            if dir.join("wintun.dll").exists() || dir.join("geoip.dat").exists() {
                return dir.to_path_buf();
            }
        }
    }
    if let Ok(data_dir) = app.path().app_data_dir() {
        let core_dir = data_dir.join("core");
        if core_dir.join("wintun.dll").exists() || core_dir.join("geoip.dat").exists() {
            return core_dir;
        }
    }
    PathBuf::from(".")
}

#[cfg(feature = "standalone-exe")]
fn ensure_standalone_core(app_data_dir: &Path) {
    use flate2::read::GzDecoder;
    use std::io::Read;

    let core_dir = app_data_dir.join("core");
    let _ = std::fs::create_dir_all(&core_dir);

    let embedded: &[(&str, &[u8])] = &[
        ("xray.exe", include_bytes!("../embedded/xray.exe.gz")),
        ("tun2socks.exe", include_bytes!("../embedded/tun2socks.exe.gz")),
        ("wintun.dll", include_bytes!("../embedded/wintun.dll.gz")),
        ("geoip.dat", include_bytes!("../embedded/geoip.dat.gz")),
        ("geosite.dat", include_bytes!("../embedded/geosite.dat.gz")),
    ];

    for (name, gz_bytes) in embedded {
        let dest = core_dir.join(name);
        if dest.exists() {
            continue;
        }
        let mut decoder = GzDecoder::new(*gz_bytes);
        let mut out = Vec::new();
        if decoder.read_to_end(&mut out).is_ok() {
            let _ = std::fs::write(&dest, out);
        }
    }
}

fn classify_xray_log(line: &str) -> (&'static str, String) {
    let lower = line.to_lowercase();
    let tag = if lower.contains("vcn") || lower.contains("verifypeercert") || lower.contains("reality") {
        "VCN"
    } else if lower.contains("tls") || lower.contains("x509") || lower.contains("cert") {
        "TLS"
    } else if lower.contains("dns") {
        "DNS"
    } else if lower.contains("error") || lower.contains("failed") || lower.contains("warn") {
        "Warning"
    } else {
        "Info"
    };
    (tag, line.trim().to_string())
}

fn spawn_hidden_process(
    bin_path: &Path,
    args: &[&str],
    working_dir: Option<&Path>,
    asset_dir: Option<&Path>,
) -> Result<Child, String> {
    let mut cmd = Command::new(bin_path);
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(wd) = working_dir {
        cmd.current_dir(wd);
    }
    if let Some(ad) = asset_dir {
        cmd.env("XRAY_LOCATION_ASSET", ad);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.spawn()
        .map_err(|e| format!("Failed to spawn {}: {e}", bin_path.display()))
}

fn pipe_child_logs(child: &mut Child, app: AppHandle, state: AppState, prefix: &'static str) {
    if let Some(stdout) = child.stdout.take() {
        let app_c = app.clone();
        let st_c = state.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if !line.trim().is_empty() {
                    let (tag, msg) = classify_xray_log(&line);
                    st_c.push_log(Some(&app_c), tag, &format!("{prefix}{msg}"));
                }
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let app_c = app;
        let st_c = state;
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                if !line.trim().is_empty() {
                    let (tag, msg) = classify_xray_log(&line);
                    st_c.push_log(Some(&app_c), tag, &format!("{prefix}{msg}"));
                }
            }
        });
    }
}

pub fn update_tray_icon_state(app: &AppHandle, connected: bool) {
    if let Some(tray) = app.tray_by_id("metrovpn-tray") {
        let bytes: &[u8] = if connected {
            include_bytes!("../icons/tray-connected.png")
        } else {
            include_bytes!("../icons/tray-disconnected.png")
        };
        if let Ok(img) = tauri::image::Image::from_bytes(bytes) {
            let _ = tray.set_icon(Some(img));
        }
        let tip = if connected {
            "Metrovpn • Protected"
        } else {
            "Metrovpn • Disconnected"
        };
        let _ = tray.set_tooltip(Some(tip));
    }
}

pub fn emit_status(app: &AppHandle, state: &AppState) {
    let payload = {
        let Ok(guard) = state.inner.lock() else {
            return;
        };
        VpnStatusPayload {
            status: guard.status.clone(),
            message: guard.error_message.clone(),
            active_node_id: guard.store.settings.active_node_id.clone(),
            system_mode: guard.store.settings.system_mode.clone(),
            elapsed_secs: guard
                .connected_at
                .map(|t| t.elapsed().as_secs())
                .unwrap_or(0),
            local_lan_ip: get_active_lan_ipv4(),
        }
    };
    update_tray_icon_state(app, payload.status == "Connected");
    let _ = app.emit("vpn://status", &payload);
}

pub async fn connect_internal(
    app: AppHandle,
    state: AppState,
    server_id: String,
    mode: String,
) -> Result<VpnStatusPayload, String> {
    let mode_norm = if mode.eq_ignore_ascii_case("TUN") {
        "TUN".to_string()
    } else {
        "PROXY".to_string()
    };

    if mode_norm == "TUN" && !is_elevated() {
        return Err("ADMIN_REQUIRED".into());
    }

    // Tear down any existing tunnel cleanly first
    state.cleanup_all();

    let (node, settings, app_data_dir) = {
        let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        guard.status = "Connecting".into();
        guard.error_message = None;
        guard.store.settings.system_mode = mode_norm.clone();
        guard.store.settings.active_node_id = Some(server_id.clone());

        let node = guard
            .store
            .servers
            .iter()
            .find(|s| s.id == server_id)
            .cloned()
            .ok_or_else(|| format!("Server node '{server_id}' not found"))?;
        let settings = guard.store.settings.clone();
        let dir = guard.app_data_dir.clone();
        save_store(&guard.store_path, &guard.store);
        (node, settings, dir)
    };

    emit_status(&app, &state);
    state.push_log(
        Some(&app),
        "TLS",
        &format!(
            "Dialing {} ({}) via {} [{}]...",
            node.name, node.sni, settings.tunnel_profile, mode_norm
        ),
    );

    let socks_port = settings.socks_port.max(1024);
    let http_port = settings.http_port.max(1024);

    // Build and write runtime Xray config.json
    let runtime_cfg = build_xray_config(&node, &settings, socks_port, http_port, true);
    let config_path = app_data_dir.join("xray-runtime.json");
    let cfg_pretty = serde_json::to_string_pretty(&runtime_cfg)
        .map_err(|e| format!("Failed to serialize Xray config: {e}"))?;
    std::fs::write(&config_path, cfg_pretty)
        .map_err(|e| format!("Failed to write Xray runtime config: {e}"))?;

    let xray_bin = match resolve_sidecar_path(&app, "xray") {
        Ok(p) => p,
        Err(e) => {
            if let Ok(mut g) = state.inner.lock() {
                g.status = "Error".into();
                g.error_message = Some(e.clone());
            }
            emit_status(&app, &state);
            return Err(e);
        }
    };
    let res_dir = resolve_resource_dir(&app);

    let cfg_str = config_path.to_string_lossy().to_string();
    let mut xray_child =
        match spawn_hidden_process(&xray_bin, &["run", "-c", &cfg_str], Some(&app_data_dir), Some(&res_dir)) {
            Ok(c) => c,
            Err(e) => {
                if let Ok(mut g) = state.inner.lock() {
                    g.status = "Error".into();
                    g.error_message = Some(e.clone());
                }
                emit_status(&app, &state);
                return Err(e);
            }
        };

    pipe_child_logs(&mut xray_child, app.clone(), state.clone(), "");

    // Wait up to 900ms for Xray to bind local port and verify it didn't exit early
    let mut xray_ready = false;
    for _ in 0..18 {
        if let Ok(Some(exit_status)) = xray_child.try_wait() {
            let msg = format!("Xray-core exited prematurely ({exit_status})");
            if let Ok(mut g) = state.inner.lock() {
                g.status = "Error".into();
                g.error_message = Some(msg.clone());
            }
            emit_status(&app, &state);
            return Err(msg);
        }
        if tokio::net::TcpStream::connect(("127.0.0.1", socks_port))
            .await
            .is_ok()
        {
            xray_ready = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    if !xray_ready {
        state.push_log(Some(&app), "Warning", "Xray-core still warming up SOCKS5 listener...");
    }

    // Apply Windows traffic routing (System Proxy or Wintun TUN)
    let mut tun_child_opt: Option<Child> = None;
    let mut pinned_ips: Vec<String> = Vec::new();

    if mode_norm == "TUN" {
        let tun_bin = match resolve_sidecar_path(&app, "tun2socks") {
            Ok(p) => p,
            Err(e) => {
                let _ = xray_child.kill();
                return Err(e);
            }
        };

        // Ensure wintun.dll exists in tun2socks working directory
        let wintun_src = res_dir.join("wintun.dll");
        if let Some(tun_dir) = tun_bin.parent() {
            let wintun_dst = tun_dir.join("wintun.dll");
            if wintun_src.exists() && !wintun_dst.exists() {
                let _ = std::fs::copy(&wintun_src, &wintun_dst);
            }
        }

        let mtu_str = settings.mtu.to_string();
        let proxy_arg = format!("socks5://127.0.0.1:{socks_port}");
        let mut tun_child = spawn_hidden_process(
            &tun_bin,
            &[
                "-device",
                "tun://Metrovpn-TUN",
                "-proxy",
                &proxy_arg,
                "-mtu",
                &mtu_str,
            ],
            Some(&res_dir),
            None,
        )?;
        pipe_child_logs(&mut tun_child, app.clone(), state.clone(), "[TUN] ");

        tokio::time::sleep(Duration::from_millis(900)).await;
        let dns_ip = match settings.dns_resolver.as_str() {
            "Cloudflare 1.1.1.2" => "1.1.1.2",
            "Google 8.8.8.8" => "8.8.8.8",
            "Quad9 9.9.9.9" => "9.9.9.9",
            _ => "1.1.1.1",
        };
        pinned_ips = configure_tun_interface("Metrovpn-TUN", &node.address, dns_ip, settings.mtu)?;
        tun_child_opt = Some(tun_child);
        state.push_log(
            Some(&app),
            "VCN",
            &format!("Wintun adapter 'Metrovpn-TUN' active (MTU {} B)", settings.mtu),
        );
    } else {
        let backup_path = backup_file_path(&app_data_dir);
        enable_system_proxy(
            &backup_path,
            http_port,
            settings.bypass_lan,
            &settings.system_proxy_exceptions,
        )?;
        state.push_log(
            Some(&app),
            "VCN",
            &format!(
                "Windows System Proxy active on 127.0.0.1:{http_port} (WinINET refreshed)"
            ),
        );
    }

    if settings.lan_proxy_sharing {
        let lan_ip = get_active_lan_ipv4();
        state.push_log(
            Some(&app),
            "Info",
            &format!("LAN Proxy Sharing bound to {lan_ip}:{socks_port} (SOCKS5) / :{http_port} (HTTP)"),
        );
    }

    let gen = {
        let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        guard.xray_child = Some(xray_child);
        guard.tun_child = tun_child_opt;
        guard.pinned_server_ips = pinned_ips;
        guard.status = "Connected".into();
        guard.error_message = None;
        guard.connected_at = Some(Instant::now());
        guard.last_up_bytes = 0;
        guard.last_down_bytes = 0;
        guard.telemetry_generation = guard.telemetry_generation.wrapping_add(1);
        guard.telemetry_generation
    };

    emit_status(&app, &state);
    spawn_telemetry_loop(app.clone(), state.clone(), gen);

    let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
    Ok(VpnStatusPayload {
        status: guard.status.clone(),
        message: None,
        active_node_id: guard.store.settings.active_node_id.clone(),
        system_mode: guard.store.settings.system_mode.clone(),
        elapsed_secs: 0,
        local_lan_ip: get_active_lan_ipv4(),
    })
}

fn spawn_telemetry_loop(app: AppHandle, state: AppState, generation: u64) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;

            let (still_active, elapsed, prev_down, prev_up) = {
                let Ok(guard) = state.inner.lock() else {
                    break;
                };
                if guard.telemetry_generation != generation || guard.status != "Connected" {
                    break;
                }
                (
                    true,
                    guard
                        .connected_at
                        .map(|t| t.elapsed().as_secs())
                        .unwrap_or(0),
                    guard.last_down_bytes,
                    guard.last_up_bytes,
                )
            };

            if !still_active {
                break;
            }

            let totals = query_xray_stats(STATS_API_PORT).await.unwrap_or_default();
            let down_bps = totals.downlink_bytes.saturating_sub(prev_down);
            let up_bps = totals.uplink_bytes.saturating_sub(prev_up);

            if let Ok(mut guard) = state.inner.lock() {
                if guard.telemetry_generation != generation {
                    break;
                }
                guard.last_down_bytes = totals.downlink_bytes;
                guard.last_up_bytes = totals.uplink_bytes;
            }

            let payload = TelemetryPayload {
                down_bps,
                up_bps,
                total_down: totals.downlink_bytes,
                total_up: totals.uplink_bytes,
                elapsed_secs: elapsed,
            };
            let _ = app.emit("vpn://telemetry", &payload);
        }
    });
}

// ============================================================================
// TAURI COMMANDS
// ============================================================================

#[tauri::command]
pub async fn import_uri(
    app: AppHandle,
    state: State<'_, AppState>,
    input: String,
    mode: Option<String>,
) -> Result<Vec<ServerNode>, String> {
    let nodes = parse_any(&input, mode.as_deref())?;
    {
        let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        for n in nodes.iter().rev() {
            guard.store.servers.insert(0, n.clone());
        }
        if let Some(first) = nodes.first() {
            guard.store.settings.active_node_id = Some(first.id.clone());
        }
        save_store(&guard.store_path, &guard.store);
    }
    state.push_log(
        Some(&app),
        "Info",
        &format!("Imported {} tunnel node(s) into Metrovpn store", nodes.len()),
    );
    Ok(nodes)
}

#[tauri::command]
pub async fn import_subscription(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<Vec<ServerNode>, String> {
    let clean_url = url.trim().to_string();
    let (nodes, quota) = fetch_subscription(&clean_url).await?;
    {
        let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        if guard.store.settings.sub_clear_before_update {
            guard.store.servers.clear();
        }
        if !clean_url.is_empty() && !guard.store.settings.saved_subscriptions.contains(&clean_url) {
            guard.store.settings.saved_subscriptions.push(clean_url.clone());
        }
        for n in nodes.iter().rev() {
            guard.store.servers.insert(0, n.clone());
        }
        if let Some(first) = nodes.first() {
            guard.store.settings.active_node_id = Some(first.id.clone());
        }
        save_store(&guard.store_path, &guard.store);
    }
    let quota_note = quota
        .map(|(u, t)| format!(" (Quota: {u:.1}/{t:.1} GB)"))
        .unwrap_or_default();
    state.push_log(
        Some(&app),
        "Info",
        &format!("Synced {} node(s) from subscription{quota_note}", nodes.len()),
    );
    Ok(nodes)
}

#[tauri::command]
pub async fn update_all_subscriptions(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<ServerNode>, String> {
    let (subs, clear_first) = {
        let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        (
            guard.store.settings.saved_subscriptions.clone(),
            guard.store.settings.sub_clear_before_update,
        )
    };
    if subs.is_empty() {
        return Err("No saved subscription URLs configured yet".into());
    }

    let mut fetched_all = Vec::new();
    for url in subs {
        if let Ok((nodes, _)) = fetch_subscription(&url).await {
            fetched_all.extend(nodes);
        }
    }

    if fetched_all.is_empty() {
        return Err("Failed to fetch nodes from saved subscriptions".into());
    }

    let all_nodes = {
        let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        if clear_first {
            guard.store.servers.clear();
        }
        for n in fetched_all.iter().rev() {
            guard.store.servers.insert(0, n.clone());
        }
        if guard.store.settings.active_node_id.is_none() {
            guard.store.settings.active_node_id =
                guard.store.servers.first().map(|s| s.id.clone());
        }
        save_store(&guard.store_path, &guard.store);
        guard.store.servers.clone()
    };

    state.push_log(
        Some(&app),
        "Info",
        &format!("Synced {} node(s) from saved subscriptions", fetched_all.len()),
    );
    Ok(all_nodes)
}

#[tauri::command]
pub async fn decode_qr_image(bytes: Vec<u8>) -> Result<String, String> {
    decode_qr_from_bytes(&bytes)
}

#[tauri::command]
pub async fn list_servers(state: State<'_, AppState>) -> Result<Vec<ServerNode>, String> {
    let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
    Ok(guard.store.servers.clone())
}

#[tauri::command]
pub async fn update_server(
    state: State<'_, AppState>,
    id: String,
    name: String,
    isp: String,
    sni: String,
) -> Result<ServerNode, String> {
    let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
    let node = guard
        .store
        .servers
        .iter_mut()
        .find(|s| s.id == id)
        .ok_or_else(|| "Server not found".to_string())?;
    node.name = name;
    node.isp = isp;
    node.sni = sni;
    let updated = node.clone();
    save_store(&guard.store_path, &guard.store);
    Ok(updated)
}

#[tauri::command]
pub async fn delete_server(state: State<'_, AppState>, id: String) -> Result<Vec<ServerNode>, String> {
    let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
    guard.store.servers.retain(|s| s.id != id);
    if guard.store.settings.active_node_id.as_deref() == Some(id.as_str()) {
        guard.store.settings.active_node_id =
            guard.store.servers.first().map(|s| s.id.clone());
    }
    save_store(&guard.store_path, &guard.store);
    Ok(guard.store.servers.clone())
}

#[tauri::command]
pub async fn toggle_star(state: State<'_, AppState>, id: String) -> Result<ServerNode, String> {
    let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
    let node = guard
        .store
        .servers
        .iter_mut()
        .find(|s| s.id == id)
        .ok_or_else(|| "Server not found".to_string())?;
    node.starred = !node.starred;
    let updated = node.clone();
    save_store(&guard.store_path, &guard.store);
    Ok(updated)
}

#[tauri::command]
pub async fn connect_server(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    mode: String,
) -> Result<VpnStatusPayload, String> {
    connect_internal(app, state.inner().clone(), id, mode).await
}

#[tauri::command]
pub async fn disconnect(app: AppHandle, state: State<'_, AppState>) -> Result<VpnStatusPayload, String> {
    state.cleanup_all();
    state.push_log(Some(&app), "Info", "VPN tunnel closed cleanly");
    emit_status(&app, state.inner());
    get_status(state).await
}

#[tauri::command]
pub async fn get_status(state: State<'_, AppState>) -> Result<VpnStatusPayload, String> {
    let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
    Ok(VpnStatusPayload {
        status: guard.status.clone(),
        message: guard.error_message.clone(),
        active_node_id: guard.store.settings.active_node_id.clone(),
        system_mode: guard.store.settings.system_mode.clone(),
        elapsed_secs: guard
            .connected_at
            .map(|t| t.elapsed().as_secs())
            .unwrap_or(0),
        local_lan_ip: get_active_lan_ipv4(),
    })
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
    Ok(guard.store.settings.clone())
}

#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: AppSettings,
    reconnect: Option<bool>,
) -> Result<AppSettings, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        let autostart = app.autolaunch();
        if settings.start_with_windows {
            let _ = autostart.enable();
        } else {
            let _ = autostart.disable();
        }
    }

    let (was_connected, active_id, new_mode) = {
        let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        let was_conn = guard.status == "Connected";
        let active_id = settings
            .active_node_id
            .clone()
            .or_else(|| guard.store.settings.active_node_id.clone());
        let mode = settings.system_mode.clone();
        guard.store.settings = settings.clone();
        save_store(&guard.store_path, &guard.store);
        (was_conn, active_id, mode)
    };

    emit_status(&app, state.inner());

    if was_connected && reconnect.unwrap_or(false) {
        if let Some(id) = active_id {
            let _ = connect_internal(app, state.inner().clone(), id, new_mode).await;
        }
    }

    Ok(settings)
}

#[tauri::command]
pub async fn reconnect_active(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<VpnStatusPayload, String> {
    let (active_id, mode) = {
        let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        let id = guard
            .store
            .settings
            .active_node_id
            .clone()
            .or_else(|| guard.store.servers.first().map(|s| s.id.clone()))
            .ok_or_else(|| "No active server node selected".to_string())?;
        (id, guard.store.settings.system_mode.clone())
    };
    connect_internal(app, state.inner().clone(), active_id, mode).await
}

#[tauri::command]
pub async fn reset_settings(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<AppSettings, String> {
    let fresh = {
        let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        let active_id = guard.store.settings.active_node_id.clone();
        let onboarding_done = guard.store.settings.onboarding_completed;
        let mut defaults = AppSettings::default();
        defaults.active_node_id = active_id;
        defaults.onboarding_completed = onboarding_done;
        guard.store.settings = defaults.clone();
        save_store(&guard.store_path, &guard.store);
        defaults
    };
    emit_status(&app, state.inner());
    state.push_log(Some(&app), "Info", "Settings restored to MetroVPN defaults");
    Ok(fresh)
}

#[tauri::command]
pub async fn check_github_update() -> Result<ReleaseUpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::builder()
        .user_agent("Metrovpn-Desktop")
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to initialize update client: {e}"))?;

    let resp = client
        .get("https://api.github.com/repos/Metro-dens/MetroVPN-for-Windows/releases/latest")
        .send()
        .await
        .map_err(|e| format!("Failed to reach GitHub Releases: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub Releases returned HTTP {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid GitHub release payload: {e}"))?;

    let tag = body["tag_name"]
        .as_str()
        .unwrap_or(&current)
        .trim_start_matches('v')
        .to_string();
    let html_url = body["html_url"]
        .as_str()
        .unwrap_or("https://github.com/Metro-dens/MetroVPN-for-Windows/releases")
        .to_string();
    let published_at = body["published_at"].as_str().unwrap_or("").to_string();

    Ok(ReleaseUpdateInfo {
        update_available: tag != current && !tag.is_empty(),
        current_version: current,
        latest_version: tag,
        release_url: html_url,
        published_at,
    })
}

#[tauri::command]
pub async fn get_logs(state: State<'_, AppState>) -> Result<Vec<LogEntry>, String> {
    let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
    Ok(guard.logs.iter().cloned().collect())
}

#[tauri::command]
pub async fn clear_logs(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
    guard.logs.clear();
    Ok(())
}

#[tauri::command]
pub async fn refresh_local_ip() -> Result<String, String> {
    Ok(get_active_lan_ipv4())
}

#[tauri::command]
pub async fn is_admin() -> Result<bool, String> {
    Ok(is_elevated())
}

#[tauri::command]
pub async fn restart_as_admin(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.cleanup_all();
    relaunch_as_admin()?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub async fn add_custom_windows_app(
    state: State<'_, AppState>,
    path: String,
) -> Result<Vec<WindowsAppRule>, String> {
    let p = Path::new(&path);
    let exe = p
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid executable path".to_string())?
        .to_string();
    let display_name = exe
        .strip_suffix(".exe")
        .or_else(|| exe.strip_suffix(".EXE"))
        .unwrap_or(&exe)
        .to_string();

    let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
    if !guard
        .store
        .settings
        .windows_apps
        .iter()
        .any(|a| a.exe.eq_ignore_ascii_case(&exe))
    {
        guard.store.settings.windows_apps.insert(
            0,
            WindowsAppRule {
                id: format!("app-{}", Uuid::new_v4().simple()),
                name: display_name,
                exe,
                category: "Custom".into(),
                bypassed: true,
            },
        );
        save_store(&guard.store_path, &guard.store);
    }
    Ok(guard.store.settings.windows_apps.clone())
}

#[tauri::command]
pub async fn quit_app(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.cleanup_all();
    app.exit(0);
    Ok(())
}
