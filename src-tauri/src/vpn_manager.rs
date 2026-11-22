use crate::models::{
    AppSettings, LogEntry, PersistedStore, ReleaseUpdateInfo, ServerNode, TelemetryPayload,
    UpdateDownloadProgress, VpnStatusPayload, WindowsAppRule,
};
use crate::network_win::{
    backup_file_path, capture_virtual_screen_rgba, configure_tun_interface, enable_system_proxy,
    get_active_lan_ipv4, is_elevated, kill_stale_core_processes, relaunch_as_admin,
    restore_system_proxy, scan_installed_windows_apps, teardown_tun_routes, CREATE_NO_WINDOW,
};
use crate::parser::{decode_qr_from_bytes, decode_qr_from_rgba, fetch_subscription, parse_any};
use crate::xray_config::{build_xray_config, HTTP_PORT, SOCKS_PORT, STATS_API_PORT};
use crate::xray_stats::query_xray_stats;
use chrono::Local;
use futures_util::StreamExt;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Write};
use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const MAX_LOG_LINES: usize = 500;
const DEFAULT_QUOTA_HOST: &str = "vpn.metrodens.site";
const UPDATE_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/Metro-dens/MetroVPN-for-Windows/main/update.json";
const GITHUB_RELEASES_API_URL: &str =
    "https://api.github.com/repos/Metro-dens/MetroVPN-for-Windows/releases/latest";

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
        // Always enforce fixed SOCKS5 (10808) & HTTP (10809) ports matching Android XrayConfigBuilder
        store.settings.socks_port = SOCKS_PORT;
        store.settings.http_port = HTTP_PORT;
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
            "Metrovpn Desktop engine ready (Xray-core v26.11.9 • Fixed SOCKS:10808 / HTTP:10809)",
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
            save_store(&guard.store_path, &guard.store);
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

        kill_stale_core_processes();
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

    let socks_port = SOCKS_PORT;
    let http_port = HTTP_PORT;

    // Build and write runtime Xray config.json
    let mut runtime_cfg = build_xray_config(&node, &settings, socks_port, http_port, true);

    // Pre-resolve server domain IPv4 into Xray dns.hosts when in TUN mode so Xray never hits a DNS bootstrap loop
    if mode_norm == "TUN" && node.address.parse::<IpAddr>().is_err() {
        if let Ok(addrs) = std::net::ToSocketAddrs::to_socket_addrs(&(node.address.as_str(), node.port)) {
            let v4s: Vec<String> = addrs
                .filter_map(|a| match a {
                    SocketAddr::V4(v4) => Some(v4.ip().to_string()),
                    _ => None,
                })
                .collect();
            if !v4s.is_empty() {
                if let Some(dns_obj) = runtime_cfg.get_mut("dns").and_then(|d| d.as_object_mut()) {
                    let mut hosts = serde_json::Map::new();
                    hosts.insert(node.address.clone(), serde_json::json!(v4s));
                    dns_obj.insert("hosts".to_string(), serde_json::Value::Object(hosts));
                }
            }
        }
    }

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

    // Wait up to 1800ms for Xray to bind local SOCKS5 (10808) & HTTP (10809) ports and verify it didn't exit early
    let mut xray_ready = false;
    for _ in 0..36 {
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
        state.push_log(Some(&app), "Warning", "Xray-core still warming up SOCKS5 listener on 10808...");
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

        // Ensure wintun.dll exists next to tun2socks.exe (required by Windows LOAD_LIBRARY_SEARCH_APPLICATION_DIR).
        // If the install directory is read-only, stage both into writable %AppData%\...\core.
        let mut effective_tun_bin = tun_bin.clone();
        let wintun_src = res_dir.join("wintun.dll");
        if let Some(tun_dir) = tun_bin.parent() {
            let wintun_dst = tun_dir.join("wintun.dll");
            if wintun_src.exists() && !wintun_dst.exists() {
                if let Err(err) = std::fs::copy(&wintun_src, &wintun_dst) {
                    let stage_dir = app_data_dir.join("core");
                    let _ = std::fs::create_dir_all(&stage_dir);
                    let staged_bin = stage_dir.join("tun2socks.exe");
                    let staged_dll = stage_dir.join("wintun.dll");
                    if std::fs::copy(&tun_bin, &staged_bin).is_ok()
                        && std::fs::copy(&wintun_src, &staged_dll).is_ok()
                    {
                        effective_tun_bin = staged_bin;
                    } else {
                        state.push_log(
                            Some(&app),
                            "Warning",
                            &format!("Could not copy wintun.dll next to tun2socks.exe: {err}"),
                        );
                    }
                }
            }
        }

        let mtu_str = settings.mtu.to_string();
        let proxy_arg = format!("socks5://127.0.0.1:{socks_port}");
        let tun_cwd = effective_tun_bin.parent().unwrap_or(&res_dir);
        // tun2socks v2.7.0 uses spf13/pflag: long flags MUST use double-dashes (--device, --proxy, --mtu)
        let mut tun_child = spawn_hidden_process(
            &effective_tun_bin,
            &[
                "--device",
                "tun://Metrovpn-TUN",
                "--proxy",
                &proxy_arg,
                "--mtu",
                &mtu_str,
                "--loglevel",
                "warn",
            ],
            Some(tun_cwd),
            None,
        )?;
        pipe_child_logs(&mut tun_child, app.clone(), state.clone(), "[TUN] ");

        tokio::time::sleep(Duration::from_millis(900)).await;
        if let Ok(Some(exit_status)) = tun_child.try_wait() {
            let _ = xray_child.kill();
            let last_tun_err = state
                .inner
                .lock()
                .ok()
                .and_then(|g| {
                    g.logs
                        .iter()
                        .rev()
                        .find(|l| l.msg.starts_with("[TUN] "))
                        .map(|l| l.msg.clone())
                });
            let msg = match last_tun_err {
                Some(detail) => format!("tun2socks exited ({exit_status}): {detail}"),
                None => format!("tun2socks exited early ({exit_status}) — ensure Wintun driver is allowed"),
            };
            if let Ok(mut g) = state.inner.lock() {
                g.status = "Error".into();
                g.error_message = Some(msg.clone());
            }
            emit_status(&app, &state);
            return Err(msg);
        }

        let dns_ip = match settings.dns_resolver.as_str() {
            "Cloudflare 1.1.1.2" => "1.1.1.2",
            "Google 8.8.8.8" => "8.8.8.8",
            "Quad9 9.9.9.9" => "9.9.9.9",
            _ => "1.1.1.1",
        };
        pinned_ips = match configure_tun_interface("Metrovpn-TUN", &node.address, dns_ip, settings.mtu) {
            Ok(ips) => ips,
            Err(e) => {
                let _ = tun_child.kill();
                let _ = xray_child.kill();
                if let Ok(mut g) = state.inner.lock() {
                    g.status = "Error".into();
                    g.error_message = Some(e.clone());
                }
                emit_status(&app, &state);
                return Err(e);
            }
        };
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

    // Automatically sync 3x-ui inbound client quota 500ms after tunnel is up (matching Android MainViewModel)
    let app_q = app.clone();
    let state_q = state.clone();
    let node_id_q = server_id.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let _ = sync_node_quota_internal(&app_q, &state_q, &node_id_q).await;
    });

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
        let mut ticks: u64 = 0;
        loop {
            interval.tick().await;
            ticks = ticks.wrapping_add(1);

            let (still_active, elapsed, prev_down, prev_up, active_id_opt) = {
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
                    guard.store.settings.active_node_id.clone(),
                )
            };

            if !still_active {
                break;
            }

            let totals = query_xray_stats(STATS_API_PORT).await.unwrap_or_default();
            let down_bps = totals.downlink_bytes.saturating_sub(prev_down);
            let up_bps = totals.uplink_bytes.saturating_sub(prev_up);
            let delta_bytes = down_bps.saturating_add(up_bps);

            let active_quota_gb = if let Ok(mut guard) = state.inner.lock() {
                if guard.telemetry_generation != generation {
                    break;
                }
                guard.last_down_bytes = totals.downlink_bytes;
                guard.last_up_bytes = totals.uplink_bytes;

                let mut quota_now = None;
                if let Some(active_id) = guard.store.settings.active_node_id.clone() {
                    if let Some(node) = guard.store.servers.iter_mut().find(|s| s.id == active_id) {
                        if delta_bytes > 0 {
                            node.quota_down_bytes = node.quota_down_bytes.saturating_add(down_bps);
                            node.quota_up_bytes = node.quota_up_bytes.saturating_add(up_bps);
                            let delta_gb = (delta_bytes as f64) / 1_073_741_824.0;
                            node.quota_used_gb += delta_gb;
                        }
                        quota_now = Some(node.quota_used_gb);
                    }
                }
                if delta_bytes > 0 && ticks % 10 == 0 {
                    save_store(&guard.store_path, &guard.store);
                }
                quota_now
            } else {
                None
            };

            // Re-sync 3x-ui server quota every 45 seconds while connected
            if ticks % 45 == 0 {
                if let Some(active_id) = active_id_opt {
                    let app_c = app.clone();
                    let st_c = state.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = sync_node_quota_internal(&app_c, &st_c, &active_id).await;
                    });
                }
            }

            let payload = TelemetryPayload {
                down_bps,
                up_bps,
                total_down: totals.downlink_bytes,
                total_up: totals.uplink_bytes,
                elapsed_secs: elapsed,
                active_node_quota_used_gb: active_quota_gb,
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
    let imported_ids: Vec<String> = nodes.iter().map(|n| n.id.clone()).collect();
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

    // Sync 3x-ui inbound client quota for newly imported nodes in the background
    let app_q = app.clone();
    let st_q = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        for id in imported_ids {
            let _ = sync_node_quota_internal(&app_q, &st_q, &id).await;
        }
    });

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
    mut settings: AppSettings,
    reconnect: Option<bool>,
) -> Result<AppSettings, String> {
    // Enforce fixed SOCKS5 (10808) & HTTP (10809) ports matching Android XrayConfigBuilder
    settings.socks_port = SOCKS_PORT;
    settings.http_port = HTTP_PORT;

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

// ============================================================================
// 3X-UI INBOUND CLIENT QUOTA SYNC (Port of Android ClientQuotaFetcher.kt)
// ============================================================================

#[derive(Debug, Clone)]
struct QuotaLookupResult {
    found: bool,
    up_bytes: u64,
    down_bytes: u64,
    total_bytes: u64,
    expiry_ms: u64,
    enabled: bool,
    email: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct QuotaTarget {
    url: String,
    host_domain: String,
    ip_override: Option<IpAddr>,
}

fn extract_single_host(raw: &str) -> Option<String> {
    let mut host = raw.trim();
    if host.is_empty() || host.contains('*') || host.contains(' ') || host.contains('/') {
        return None;
    }
    if let Some(stripped) = host.strip_prefix("http://").or_else(|| host.strip_prefix("HTTP://")) {
        host = stripped;
    } else if let Some(stripped) = host.strip_prefix("https://").or_else(|| host.strip_prefix("HTTPS://")) {
        host = stripped;
    }
    let colon_count = host.chars().filter(|&c| c == ':').count();
    if colon_count == 1 {
        if let Some((before, _)) = host.split_once(':') {
            host = before;
        }
    }
    let clean = host.trim_start_matches('[').trim_end_matches(']');
    if clean.contains('.') || clean.contains(':') {
        Some(clean.to_string())
    } else {
        None
    }
}

fn extract_valid_hosts(raw: &str) -> Vec<String> {
    if raw.trim().is_empty() {
        return Vec::new();
    }
    raw.split(',').filter_map(extract_single_host).collect()
}

fn parse_ip_addr(host: &str) -> Option<IpAddr> {
    let clean = host.trim().trim_start_matches('[').trim_end_matches(']');
    clean.parse::<IpAddr>().ok()
}

fn build_quota_targets(node: &ServerNode) -> Vec<QuotaTarget> {
    let clean_uuid = node.uuid.trim();
    if clean_uuid.is_empty() {
        return Vec::new();
    }

    let mut domain_hosts: Vec<String> = Vec::new();
    let mut push_unique = |h: String| {
        if parse_ip_addr(&h).is_none()
            && !domain_hosts.iter().any(|existing| existing.eq_ignore_ascii_case(&h))
        {
            domain_hosts.push(h);
        }
    };

    if let Some(vcn) = &node.vcn_host {
        for h in extract_valid_hosts(vcn) {
            push_unique(h);
        }
    }
    if let Some(ws_h) = &node.host {
        if let Some(h) = extract_single_host(ws_h) {
            push_unique(h);
        }
    }
    if let Some(addr_h) = extract_single_host(&node.address) {
        push_unique(addr_h);
    }
    if let Some(sni_h) = extract_single_host(&node.sni) {
        let lower = sni_h.to_lowercase();
        if lower == DEFAULT_QUOTA_HOST || lower.ends_with(".metrodens.site") {
            push_unique(sni_h);
        }
    }
    push_unique(DEFAULT_QUOTA_HOST.to_string());

    let mut targets = Vec::new();
    for host in &domain_hosts {
        targets.push(QuotaTarget {
            url: format!("https://{host}/api/quota?uuid={clean_uuid}"),
            host_domain: host.clone(),
            ip_override: None,
        });
    }

    // If node.address is an IP (e.g. dedicated/router VPS), also query that IP directly with TLS SNI + Host matching VCN/wsHost
    if let Some(addr_h) = extract_single_host(&node.address) {
        if let Some(ip) = parse_ip_addr(&addr_h) {
            let mut sni_candidates: Vec<String> = Vec::new();
            if let Some(vcn) = &node.vcn_host {
                for h in extract_valid_hosts(vcn) {
                    if parse_ip_addr(&h).is_none() && !sni_candidates.contains(&h) {
                        sni_candidates.push(h);
                    }
                }
            }
            if let Some(ws_h) = &node.host {
                if let Some(h) = extract_single_host(ws_h) {
                    if parse_ip_addr(&h).is_none() && !sni_candidates.contains(&h) {
                        sni_candidates.push(h);
                    }
                }
            }
            for sni_domain in sni_candidates {
                targets.push(QuotaTarget {
                    url: format!("https://{sni_domain}/api/quota?uuid={clean_uuid}"),
                    host_domain: sni_domain,
                    ip_override: Some(ip),
                });
            }
        }
    }

    targets
}

fn parse_quota_response(body: &str) -> Result<QuotaLookupResult, String> {
    let json: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("Invalid quota JSON: {e}"))?;
    let payload = json
        .get("obj")
        .filter(|v| v.is_object())
        .unwrap_or(&json);

    let explicit_found = if let Some(f) = json.get("found").and_then(|v| v.as_bool()) {
        f
    } else if let Some(s) = json.get("success").and_then(|v| v.as_bool()) {
        s
    } else {
        payload.get("up").is_some()
            || payload.get("down").is_some()
            || payload.get("total").is_some()
            || payload.get("email").is_some()
    };

    let as_u64 = |v: Option<&serde_json::Value>| -> u64 {
        match v {
            Some(serde_json::Value::Number(n)) => n.as_u64().or_else(|| n.as_i64().map(|i| i.max(0) as u64)).unwrap_or(0),
            Some(serde_json::Value::String(s)) => s.parse::<u64>().unwrap_or(0),
            _ => 0,
        }
    };

    let raw_expiry = as_u64(payload.get("expiryTime").or_else(|| payload.get("expiryMs")));
    let expiry_ms = if (1_000_000_000..=9_999_999_999).contains(&raw_expiry) {
        raw_expiry * 1000
    } else {
        raw_expiry
    };

    let enabled = payload
        .get("enable")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let email = payload
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(QuotaLookupResult {
        found: explicit_found,
        up_bytes: as_u64(payload.get("up")),
        down_bytes: as_u64(payload.get("down")),
        total_bytes: as_u64(payload.get("total")),
        expiry_ms,
        enabled,
        email,
    })
}

pub async fn sync_node_quota_internal(
    app: &AppHandle,
    state: &AppState,
    node_id: &str,
) -> Result<ServerNode, String> {
    let (node, is_connected) = {
        let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        let n = guard
            .store
            .servers
            .iter()
            .find(|s| s.id == node_id)
            .cloned()
            .ok_or_else(|| "Server node not found".to_string())?;
        (n, guard.status == "Connected")
    };

    let targets = build_quota_targets(&node);
    if targets.is_empty() {
        return Err("Server node has no valid UUID for 3x-ui quota lookup".into());
    }

    // Try through local Xray HTTP proxy (127.0.0.1:10809) first when connected, then direct fallback
    let proxy_modes: Vec<bool> = if is_connected {
        vec![true, false]
    } else {
        vec![false]
    };

    let mut found_res: Option<QuotaLookupResult> = None;
    let mut last_err = String::from("No quota endpoint responded");

    'outer: for use_proxy in proxy_modes {
        for target in &targets {
            let mut builder = reqwest::Client::builder()
                .user_agent("MetroVPN-Windows")
                .timeout(Duration::from_millis(4500));

            if use_proxy {
                if let Ok(px) = reqwest::Proxy::all(format!("http://127.0.0.1:{HTTP_PORT}")) {
                    builder = builder.proxy(px);
                }
            } else {
                builder = builder.no_proxy();
            }

            if let Some(ip) = target.ip_override {
                builder = builder.resolve(&target.host_domain, SocketAddr::new(ip, 443));
            }

            let Ok(client) = builder.build() else {
                continue;
            };

            match client
                .get(&target.url)
                .header("Cache-Control", "no-cache")
                .header("Accept", "application/json")
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(text) = resp.text().await {
                        match parse_quota_response(&text) {
                            Ok(res) if res.found => {
                                found_res = Some(res);
                                break 'outer;
                            }
                            Ok(_) => {
                                last_err = format!("UUID not found on {}", target.host_domain);
                            }
                            Err(e) => {
                                last_err = e;
                            }
                        }
                    }
                }
                Ok(resp) => {
                    last_err = format!("HTTP {} from {}", resp.status(), target.host_domain);
                }
                Err(e) => {
                    last_err = e.to_string();
                }
            }
        }
    }

    let Some(res) = found_res else {
        return Err(last_err);
    };

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let used_bytes = res.up_bytes.saturating_add(res.down_bytes);
    let used_gb = (used_bytes as f64) / 1_073_741_824.0;
    let total_gb = if res.total_bytes > 0 {
        (res.total_bytes as f64) / 1_073_741_824.0
    } else {
        0.0
    };

    let updated_node = {
        let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        let target_node = guard
            .store
            .servers
            .iter_mut()
            .find(|s| s.id == node_id)
            .ok_or_else(|| "Server node not found".to_string())?;

        target_node.quota_up_bytes = res.up_bytes;
        target_node.quota_down_bytes = res.down_bytes;
        target_node.quota_total_bytes = res.total_bytes;
        target_node.quota_used_gb = used_gb;
        target_node.quota_total_gb = total_gb;
        target_node.quota_expiry_ms = res.expiry_ms;
        target_node.quota_enabled = res.enabled;
        target_node.quota_email = res.email.clone();
        target_node.quota_updated_at_ms = now_ms;

        let cloned = target_node.clone();
        save_store(&guard.store_path, &guard.store);
        cloned
    };

    let _ = app.emit("vpn://quota-updated", &updated_node);
    state.push_log(
        Some(app),
        "VCN",
        &format!(
            "3x-ui Quota synced for {}: Used {:.2} GB / {}",
            updated_node.name,
            used_gb,
            if total_gb > 0.0 {
                format!("{total_gb:.1} GB")
            } else {
                "Unlimited".into()
            }
        ),
    );
    Ok(updated_node)
}

#[tauri::command]
pub async fn sync_node_quota(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<ServerNode, String> {
    sync_node_quota_internal(&app, state.inner(), &id).await
}

#[tauri::command]
pub async fn sync_all_quotas(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<ServerNode>, String> {
    let ids: Vec<String> = {
        let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        guard.store.servers.iter().map(|s| s.id.clone()).collect()
    };
    for id in ids {
        let _ = sync_node_quota_internal(&app, state.inner(), &id).await;
    }
    let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
    Ok(guard.store.servers.clone())
}

// ============================================================================
// AUTO UPDATE CHECKER, DOWNLOADER & INSTALLER (Port of Android AppUpdateChecker.kt)
// ============================================================================

fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let parse_parts = |s: &str| -> Vec<u32> {
        s.trim_start_matches(['v', 'V'])
            .split(['.', '-', '+'])
            .filter_map(|p| p.parse::<u32>().ok())
            .collect()
    };
    let pa = parse_parts(a);
    let pb = parse_parts(b);
    let max_len = pa.len().max(pb.len());
    for i in 0..max_len {
        let va = pa.get(i).copied().unwrap_or(0);
        let vb = pb.get(i).copied().unwrap_or(0);
        match va.cmp(&vb) {
            std::cmp::Ordering::Equal => continue,
            non_eq => return non_eq,
        }
    }
    std::cmp::Ordering::Equal
}

fn select_best_windows_asset(assets: Option<&Vec<serde_json::Value>>) -> Option<(String, String)> {
    let list = assets?;
    let is_standalone = cfg!(feature = "standalone-exe");

    let mut setup_asset: Option<(String, String)> = None;
    let mut standalone_asset: Option<(String, String)> = None;
    let mut msi_asset: Option<(String, String)> = None;
    let mut any_exe: Option<(String, String)> = None;

    for asset in list {
        let name = asset["name"].as_str().unwrap_or("").to_string();
        let url = asset["browser_download_url"]
            .as_str()
            .unwrap_or("")
            .to_string();
        if name.is_empty() || url.is_empty() {
            continue;
        }
        let lower = name.to_lowercase();
        if lower.ends_with("-setup.exe") || lower.contains("setup") && lower.ends_with(".exe") {
            setup_asset = Some((name, url));
        } else if lower.contains("standalone") && lower.ends_with(".exe") {
            standalone_asset = Some((name, url));
        } else if lower.ends_with(".msi") {
            msi_asset = Some((name, url));
        } else if lower.ends_with(".exe") && any_exe.is_none() {
            any_exe = Some((name, url));
        }
    }

    if is_standalone {
        standalone_asset
            .or(setup_asset)
            .or(any_exe)
            .or(msi_asset)
    } else {
        setup_asset
            .or(standalone_asset)
            .or(msi_asset)
            .or(any_exe)
    }
}

#[tauri::command]
pub async fn check_github_update(state: State<'_, AppState>) -> Result<ReleaseUpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let is_connected = state
        .inner
        .lock()
        .map(|g| g.status == "Connected")
        .unwrap_or(false);

    let proxy_modes: Vec<bool> = if is_connected {
        vec![true, false]
    } else {
        vec![false]
    };

    let mut github_info: Option<ReleaseUpdateInfo> = None;
    let mut manifest_info: Option<ReleaseUpdateInfo> = None;
    let mut last_err = String::from("Failed to reach update servers");

    for use_proxy in proxy_modes {
        let mut builder = reqwest::Client::builder()
            .user_agent(format!("Metrovpn-Desktop/{current}"))
            .timeout(Duration::from_secs(8));
        if use_proxy {
            if let Ok(px) = reqwest::Proxy::all(format!("http://127.0.0.1:{HTTP_PORT}")) {
                builder = builder.proxy(px);
            }
        }
        let Ok(client) = builder.build() else {
            continue;
        };

        if github_info.is_none() {
            match client
                .get(GITHUB_RELEASES_API_URL)
                .header("Accept", "application/vnd.github+json, application/json")
                .header("Cache-Control", "no-cache")
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(body) = resp.json::<serde_json::Value>().await {
                        let tag = body["tag_name"]
                            .as_str()
                            .unwrap_or(&current)
                            .trim_start_matches(['v', 'V'])
                            .trim()
                            .to_string();
                        let html_url = body["html_url"]
                            .as_str()
                            .unwrap_or("https://github.com/Metro-dens/MetroVPN-for-Windows/releases")
                            .to_string();
                        let (asset_name, download_url) =
                            select_best_windows_asset(body["assets"].as_array()).unwrap_or_else(|| {
                                ("Metrovpn-standalone-x64.exe".into(), html_url.clone())
                            });
                        let title = body["name"]
                            .as_str()
                            .filter(|s| !s.trim().is_empty())
                            .unwrap_or("New Update Available")
                            .to_string();
                        let message = body["body"]
                            .as_str()
                            .filter(|s| !s.trim().is_empty())
                            .unwrap_or("A newer version of Metrovpn for Windows is ready to install.")
                            .to_string();
                        let published_at = body["published_at"].as_str().unwrap_or("").to_string();
                        let is_newer =
                            compare_versions(&tag, &current) == std::cmp::Ordering::Greater;

                        github_info = Some(ReleaseUpdateInfo {
                            current_version: current.clone(),
                            latest_version: tag,
                            update_available: is_newer,
                            release_url: html_url,
                            download_url,
                            asset_name,
                            title,
                            message,
                            published_at,
                            mandatory: false,
                        });
                    }
                }
                Ok(r) => last_err = format!("GitHub API returned HTTP {}", r.status()),
                Err(e) => last_err = e.to_string(),
            }
        }

        if manifest_info.is_none() {
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let url = format!("{UPDATE_MANIFEST_URL}?t={ts}");
            if let Ok(resp) = client
                .get(&url)
                .header("Cache-Control", "no-cache")
                .send()
                .await
            {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        let remote_ver = json["versionName"]
                            .as_str()
                            .unwrap_or(&current)
                            .trim_start_matches(['v', 'V'])
                            .trim()
                            .to_string();
                        let dl_url = json["downloadUrl"].as_str().unwrap_or("").trim().to_string();
                        if !remote_ver.is_empty() && !dl_url.is_empty() {
                            let is_newer = compare_versions(&remote_ver, &current)
                                == std::cmp::Ordering::Greater;
                            let asset_name = dl_url
                                .rsplit('/')
                                .next()
                                .filter(|s| !s.is_empty())
                                .unwrap_or("Metrovpn-Update.exe")
                                .to_string();
                            manifest_info = Some(ReleaseUpdateInfo {
                                current_version: current.clone(),
                                latest_version: remote_ver.clone(),
                                update_available: is_newer,
                                release_url: format!(
                                    "https://github.com/Metro-dens/MetroVPN-for-Windows/releases/tag/v{remote_ver}"
                                ),
                                download_url: dl_url,
                                asset_name,
                                title: json["title"]
                                    .as_str()
                                    .unwrap_or("New Update Available")
                                    .to_string(),
                                message: json["message"]
                                    .as_str()
                                    .unwrap_or("A newer version of Metrovpn for Windows is ready.")
                                    .to_string(),
                                published_at: String::new(),
                                mandatory: json["mandatory"].as_bool().unwrap_or(false),
                            });
                        }
                    }
                }
            }
        }

        if github_info.is_some() || manifest_info.is_some() {
            break;
        }
    }

    match (github_info, manifest_info) {
        (Some(g), Some(m)) => {
            if compare_versions(&m.latest_version, &g.latest_version) == std::cmp::Ordering::Greater
            {
                Ok(m)
            } else {
                Ok(g)
            }
        }
        (Some(g), None) => Ok(g),
        (None, Some(m)) => Ok(m),
        (None, None) => Err(last_err),
    }
}

#[tauri::command]
pub async fn download_and_install_update(
    app: AppHandle,
    state: State<'_, AppState>,
    download_url: String,
    asset_name: Option<String>,
) -> Result<String, String> {
    let (app_data_dir, is_connected) = {
        let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        (guard.app_data_dir.clone(), guard.status == "Connected")
    };

    let updates_dir = app_data_dir.join("updates");
    let _ = std::fs::create_dir_all(&updates_dir);

    let safe_name = asset_name
        .filter(|n| !n.trim().is_empty())
        .or_else(|| {
            download_url
                .rsplit('/')
                .next()
                .map(|s| s.split('?').next().unwrap_or(s).to_string())
        })
        .filter(|n| n.ends_with(".exe") || n.ends_with(".msi"))
        .unwrap_or_else(|| "Metrovpn-Update-Setup.exe".to_string());

    let out_path = updates_dir.join(&safe_name);
    let _ = std::fs::remove_file(&out_path);

    let proxy_modes: Vec<bool> = if is_connected {
        vec![true, false]
    } else {
        vec![false]
    };

    let mut downloaded_ok = false;
    let mut last_err = String::from("Failed to download update installer");

    for use_proxy in proxy_modes {
        let mut builder = reqwest::Client::builder()
            .user_agent("Metrovpn-Desktop-Updater")
            .timeout(Duration::from_secs(300));
        if use_proxy {
            if let Ok(px) = reqwest::Proxy::all(format!("http://127.0.0.1:{HTTP_PORT}")) {
                builder = builder.proxy(px);
            }
        }
        let Ok(client) = builder.build() else {
            continue;
        };

        let resp = match client.get(&download_url).send().await {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                last_err = format!("Update download HTTP {}", r.status());
                continue;
            }
            Err(e) => {
                last_err = e.to_string();
                continue;
            }
        };

        let total_bytes = resp.content_length().unwrap_or(0);
        let mut file = std::fs::File::create(&out_path)
            .map_err(|e| format!("Failed to create update file: {e}"))?;

        let mut downloaded: u64 = 0;
        let mut last_pct: u8 = 0;
        let mut last_emit = Instant::now();
        let mut stream = resp.bytes_stream();
        let mut stream_err = None;

        let _ = app.emit(
            "update://progress",
            &UpdateDownloadProgress {
                percent: 0,
                downloaded_bytes: 0,
                total_bytes,
                phase: "downloading".into(),
                file_path: None,
                error: None,
            },
        );

        while let Some(chunk_res) = stream.next().await {
            match chunk_res {
                Ok(chunk) => {
                    if let Err(e) = file.write_all(&chunk) {
                        stream_err = Some(format!("Disk write error: {e}"));
                        break;
                    }
                    downloaded += chunk.len() as u64;
                    let pct = if total_bytes > 0 {
                        ((downloaded * 100) / total_bytes).min(100) as u8
                    } else {
                        ((downloaded / (1024 * 350)).min(95) as u8).max(5)
                    };
                    if pct != last_pct || last_emit.elapsed() >= Duration::from_millis(200) {
                        last_pct = pct;
                        last_emit = Instant::now();
                        let _ = app.emit(
                            "update://progress",
                            &UpdateDownloadProgress {
                                percent: pct,
                                downloaded_bytes: downloaded,
                                total_bytes,
                                phase: "downloading".into(),
                                file_path: None,
                                error: None,
                            },
                        );
                    }
                }
                Err(e) => {
                    stream_err = Some(format!("Stream error: {e}"));
                    break;
                }
            }
        }
        let _ = file.flush();
        drop(file);

        if let Some(err) = stream_err {
            let _ = std::fs::remove_file(&out_path);
            last_err = err;
            continue;
        }

        if downloaded < 100_000 {
            let _ = std::fs::remove_file(&out_path);
            last_err = "Downloaded update file looks incomplete".into();
            continue;
        }

        downloaded_ok = true;
        break;
    }

    if !downloaded_ok {
        let _ = app.emit(
            "update://progress",
            &UpdateDownloadProgress {
                percent: 0,
                downloaded_bytes: 0,
                total_bytes: 0,
                phase: "error".into(),
                file_path: None,
                error: Some(last_err.clone()),
            },
        );
        return Err(last_err);
    }

    let out_str = out_path.to_string_lossy().to_string();
    let _ = app.emit(
        "update://progress",
        &UpdateDownloadProgress {
            percent: 100,
            downloaded_bytes: 0,
            total_bytes: 0,
            phase: "launching".into(),
            file_path: Some(out_str.clone()),
            error: None,
        },
    );

    state.push_log(
        Some(&app),
        "Info",
        &format!("Update downloaded to {out_str}. Launching installer..."),
    );

    // Tear down active VPN tunnel and remove tray icon so Windows installer can replace binaries cleanly
    state.cleanup_all();
    let _ = app.remove_tray_by_id("metrovpn-tray");

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        if out_str.to_lowercase().ends_with(".msi") {
            let _ = Command::new("msiexec")
                .args(["/i", &out_str])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
        } else {
            let _ = Command::new(&out_path).spawn();
        }
    }

    let app_exit = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(450)).await;
        app_exit.exit(0);
    });

    Ok(out_str)
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
    let _ = app.remove_tray_by_id("metrovpn-tray");
    relaunch_as_admin()?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub async fn scan_windows_apps(state: State<'_, AppState>) -> Result<Vec<WindowsAppRule>, String> {
    let existing = {
        let guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
        guard.store.settings.windows_apps.clone()
    };

    let merged = tokio::task::spawn_blocking(move || scan_installed_windows_apps(&existing))
        .await
        .map_err(|e| format!("Failed to scan installed Windows apps: {e}"))?;

    let mut guard = state.inner.lock().map_err(|_| "State lock poisoned")?;
    guard.store.settings.windows_apps = merged.clone();
    save_store(&guard.store_path, &guard.store);
    Ok(merged)
}

#[tauri::command]
pub async fn scan_screen_qr(app: AppHandle, hide_window: Option<bool>) -> Result<String, String> {
    let should_hide = hide_window.unwrap_or(true);
    let main_win = app.get_webview_window("main");

    if should_hide {
        if let Some(ref w) = main_win {
            let _ = w.hide();
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }

    let capture_res = tokio::task::spawn_blocking(capture_virtual_screen_rgba).await;

    if should_hide {
        if let Some(ref w) = main_win {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }

    let (w, h, rgba) = capture_res
        .map_err(|e| format!("Screen capture task failed: {e}"))?
        ?;

    tokio::task::spawn_blocking(move || decode_qr_from_rgba(w, h, rgba))
        .await
        .map_err(|e| format!("QR decode task failed: {e}"))?
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
    let _ = app.remove_tray_by_id("metrovpn-tray");
    app.exit(0);
    Ok(())
}
