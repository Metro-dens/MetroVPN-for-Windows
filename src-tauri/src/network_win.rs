use crate::models::WindowsAppRule;
use serde::{Deserialize, Serialize};
use std::net::UdpSocket;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProxyBackup {
    pub had_enable: bool,
    pub proxy_enable: u32,
    pub had_server: bool,
    pub proxy_server: String,
    pub had_override: bool,
    pub proxy_override: String,
    #[serde(default)]
    pub had_autoconfig: bool,
    #[serde(default)]
    pub auto_config_url: String,
}

/// Returns the machine's active LAN IPv4 address using a non-blocking UDP route lookup.
pub fn get_active_lan_ipv4() -> String {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if ip != "0.0.0.0" && !ip.starts_with("127.") {
                    return ip;
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

#[cfg(windows)]
mod win_impl {
    use super::{ProxyBackup, WindowsAppRule};
    use std::collections::{BTreeMap, HashSet};
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::process::CommandExt;
    use std::path::Path;
    use std::process::Command;
    use std::sync::OnceLock;
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        SRCCOPY,
    };
    use windows_sys::Win32::Networking::WinInet::{
        InternetSetOptionW, INTERNET_OPTION_REFRESH, INTERNET_OPTION_SETTINGS_CHANGED,
    };
    use windows_sys::Win32::System::Threading::CreateMutexW;
    use windows_sys::Win32::UI::Shell::{IsUserAnAdmin, ShellExecuteW};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        FindWindowW, GetSystemMetrics, SetForegroundWindow, ShowWindow, SM_CXVIRTUALSCREEN,
        SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SW_RESTORE, SW_SHOWNORMAL,
    };
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

    static SINGLE_INSTANCE_HANDLE: OnceLock<isize> = OnceLock::new();

    pub const CREATE_NO_WINDOW: u32 = 0x08000000;
    const INTERNET_SETTINGS_PATH: &str =
        "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    fn notify_wininet() {
        unsafe {
            InternetSetOptionW(
                std::ptr::null_mut(),
                INTERNET_OPTION_SETTINGS_CHANGED,
                std::ptr::null_mut(),
                0,
            );
            InternetSetOptionW(
                std::ptr::null_mut(),
                INTERNET_OPTION_REFRESH,
                std::ptr::null_mut(),
                0,
            );
        }
    }

    pub fn enable_system_proxy(
        backup_path: &Path,
        http_port: u16,
        bypass_lan: bool,
        custom_exceptions: &str,
    ) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = hkcu
            .open_subkey_with_flags(INTERNET_SETTINGS_PATH, KEY_READ | KEY_WRITE)
            .map_err(|e| format!("Failed to open Windows Internet Settings key: {e}"))?;

        if !backup_path.exists() {
            let mut backup = ProxyBackup::default();
            if let Ok(val) = key.get_value::<u32, _>("ProxyEnable") {
                backup.had_enable = true;
                backup.proxy_enable = val;
            }
            if let Ok(val) = key.get_value::<String, _>("ProxyServer") {
                backup.had_server = true;
                backup.proxy_server = val;
            }
            if let Ok(val) = key.get_value::<String, _>("ProxyOverride") {
                backup.had_override = true;
                backup.proxy_override = val;
            }
            if let Ok(val) = key.get_value::<String, _>("AutoConfigURL") {
                backup.had_autoconfig = true;
                backup.auto_config_url = val;
            }
            if let Some(parent) = backup_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let json = serde_json::to_string_pretty(&backup)
                .map_err(|e| format!("Failed to serialize proxy backup: {e}"))?;
            std::fs::write(backup_path, json)
                .map_err(|e| format!("Failed to write proxy backup lock file: {e}"))?;
        }

        let proxy_addr = format!("127.0.0.1:{http_port}");
        let trimmed_custom = custom_exceptions.trim();
        let override_str = if !bypass_lan {
            "<local>".to_string()
        } else if !trimmed_custom.is_empty() {
            trimmed_custom.replace(['\r', '\n'], ";")
        } else {
            "<local>;localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.2*;172.30.*;172.31.*;192.168.*".to_string()
        };

        // Clear any leftover PAC AutoConfigURL (v2rayN best practice) so ProxyServer takes precedence
        let _ = key.delete_value("AutoConfigURL");
        key.set_value("ProxyEnable", &1u32)
            .map_err(|e| format!("Failed to set ProxyEnable: {e}"))?;
        key.set_value("ProxyServer", &proxy_addr)
            .map_err(|e| format!("Failed to set ProxyServer: {e}"))?;
        key.set_value("ProxyOverride", &override_str)
            .map_err(|e| format!("Failed to set ProxyOverride: {e}"))?;

        notify_wininet();
        Ok(())
    }

    pub fn restore_system_proxy(backup_path: &Path) -> Result<bool, String> {
        if !backup_path.exists() {
            return Ok(false);
        }
        let raw = std::fs::read_to_string(backup_path)
            .map_err(|e| format!("Failed to read proxy backup: {e}"))?;
        let backup: ProxyBackup = serde_json::from_str(&raw).unwrap_or_default();

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = hkcu
            .open_subkey_with_flags(INTERNET_SETTINGS_PATH, KEY_READ | KEY_WRITE)
            .map_err(|e| format!("Failed to open Internet Settings key for restore: {e}"))?;

        if backup.had_enable {
            let _ = key.set_value("ProxyEnable", &backup.proxy_enable);
        } else {
            let _ = key.set_value("ProxyEnable", &0u32);
        }

        if backup.had_server {
            let _ = key.set_value("ProxyServer", &backup.proxy_server);
        } else {
            let _ = key.delete_value("ProxyServer");
        }

        if backup.had_override {
            let _ = key.set_value("ProxyOverride", &backup.proxy_override);
        } else {
            let _ = key.delete_value("ProxyOverride");
        }

        if backup.had_autoconfig {
            let _ = key.set_value("AutoConfigURL", &backup.auto_config_url);
        } else {
            let _ = key.delete_value("AutoConfigURL");
        }

        notify_wininet();
        let _ = std::fs::remove_file(backup_path);
        Ok(true)
    }

    pub fn is_elevated() -> bool {
        unsafe { IsUserAnAdmin() != 0 }
    }

    pub fn acquire_single_instance_or_focus() -> bool {
        let is_relaunch = std::env::args().any(|a| a == "--relaunch");
        let name = to_wide("Local\\MetrovpnSingleInstanceMutex");
        let attempts = if is_relaunch { 30 } else { 1 };
        for _ in 0..attempts {
            let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
            if handle != std::ptr::null_mut() {
                let err = unsafe { GetLastError() };
                if err != ERROR_ALREADY_EXISTS {
                    let _ = SINGLE_INSTANCE_HANDLE.set(handle as isize);
                    return true;
                }
                unsafe {
                    CloseHandle(handle);
                }
            }
            if is_relaunch {
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }

        let title = to_wide("Metrovpn");
        unsafe {
            let hwnd = FindWindowW(std::ptr::null(), title.as_ptr());
            if hwnd != std::ptr::null_mut() {
                ShowWindow(hwnd, SW_RESTORE);
                SetForegroundWindow(hwnd);
            }
        }
        false
    }

    pub fn relaunch_as_admin() -> Result<(), String> {
        let exe = std::env::current_exe()
            .map_err(|e| format!("Failed to resolve current executable: {e}"))?;
        let verb = to_wide("runas");
        let file = to_wide(&exe.to_string_lossy());
        let params = to_wide("--relaunch");
        let res = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                file.as_ptr(),
                params.as_ptr(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            )
        };
        if (res as isize) <= 32 {
            return Err("UAC elevation was cancelled or denied by Windows".into());
        }
        Ok(())
    }

    pub fn kill_stale_core_processes() {
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "xray.exe", "/T"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "tun2socks.exe", "/T"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }

    pub fn configure_tun_interface(
        interface_name: &str,
        server_host: &str,
        dns_server: &str,
        mtu: u16,
    ) -> Result<Vec<String>, String> {
        // Clean up any leftover TUN routes before querying physical default gateway
        teardown_tun_routes(&[]);

        // Resolve physical default gateway before adding split default route
        let gw_output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' | Where-Object { $_.NextHop -ne '0.0.0.0' -and $_.NextHop -ne '198.18.0.2' -and $_.InterfaceAlias -ne 'Metrovpn-TUN' } | Sort-Object RouteMetric | Select-Object -First 1).NextHop",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to query default gateway: {e}"))?;
        let mut orig_gw = String::from_utf8_lossy(&gw_output.stdout).trim().to_string();

        if orig_gw.is_empty() {
            // Fast fallback via `route print 0.0.0.0` in case PowerShell Get-NetRoute is slow or restricted
            if let Ok(rp) = Command::new("route")
                .args(["print", "0.0.0.0"])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            {
                let text = String::from_utf8_lossy(&rp.stdout);
                for line in text.lines() {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 4 && parts[0] == "0.0.0.0" && parts[1] == "0.0.0.0" {
                        let gw = parts[2];
                        if gw != "0.0.0.0" && gw != "198.18.0.2" && gw.contains('.') {
                            orig_gw = gw.to_string();
                            break;
                        }
                    }
                }
            }
        }

        // Poll up to 10 times (2.5s total) for Wintun adapter to finish registering in Windows TCP/IP stack
        let mut addr_assigned = false;
        for _ in 0..10 {
            if let Ok(out) = Command::new("netsh")
                .args([
                    "interface",
                    "ipv4",
                    "set",
                    "address",
                    &format!("name={interface_name}"),
                    "static",
                    "198.18.0.1",
                    "255.255.255.0",
                    "store=active",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            {
                if out.status.success() {
                    addr_assigned = true;
                    break;
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(250));
        }

        if !addr_assigned {
            return Err("Wintun virtual adapter 'Metrovpn-TUN' did not come online in time".into());
        }

        let _ = Command::new("netsh")
            .args([
                "interface",
                "ipv4",
                "set",
                "subinterface",
                interface_name,
                &format!("mtu={}", mtu.clamp(1280, 9000)),
                "store=active",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        let _ = Command::new("netsh")
            .args([
                "interface",
                "ipv4",
                "set",
                "dnsservers",
                &format!("name={interface_name}"),
                "static",
                dns_server,
                "primary",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        // Pin direct host routes for ALL resolved server IPv4s so TUN traffic never loops
        let mut pinned_ips = Vec::new();
        if !orig_gw.is_empty() {
            if let Ok(addrs) = std::net::ToSocketAddrs::to_socket_addrs(&(server_host, 443)) {
                for addr in addrs {
                    if let std::net::SocketAddr::V4(v4) = addr {
                        let ip = v4.ip().to_string();
                        if !pinned_ips.contains(&ip) {
                            let _ = Command::new("route")
                                .args(["add", &ip, "mask", "255.255.255.255", &orig_gw, "metric", "1"])
                                .creation_flags(CREATE_NO_WINDOW)
                                .output();
                            pinned_ips.push(ip);
                        }
                    }
                }
            }
        }

        // Resolve Metrovpn-TUN interface index so Windows binds split-default routes explicitly to the TUN adapter
        let tun_if_out = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!("(Get-NetIPInterface -InterfaceAlias '{interface_name}' -AddressFamily IPv4 | Select-Object -First 1).ifIndex"),
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        let tun_if_idx = tun_if_out
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()));

        // Route all IPv4 traffic via split-default prefix into Metrovpn-TUN
        if let Some(ref idx) = tun_if_idx {
            let _ = Command::new("route")
                .args(["add", "0.0.0.0", "mask", "128.0.0.0", "198.18.0.2", "metric", "5", "if", idx])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
            let _ = Command::new("route")
                .args(["add", "128.0.0.0", "mask", "128.0.0.0", "198.18.0.2", "metric", "5", "if", idx])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        } else {
            let _ = Command::new("route")
                .args(["add", "0.0.0.0", "mask", "128.0.0.0", "198.18.0.2", "metric", "5"])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
            let _ = Command::new("route")
                .args(["add", "128.0.0.0", "mask", "128.0.0.0", "198.18.0.2", "metric", "5"])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }

        Ok(pinned_ips)
    }

    pub fn teardown_tun_routes(pinned_server_ips: &[String]) {
        let _ = Command::new("route")
            .args(["delete", "0.0.0.0", "mask", "128.0.0.0", "198.18.0.2"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        let _ = Command::new("route")
            .args(["delete", "128.0.0.0", "mask", "128.0.0.0", "198.18.0.2"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        for ip in pinned_server_ips {
            let _ = Command::new("route")
                .args(["delete", ip, "mask", "255.255.255.255"])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
    }

    fn is_noisy_system_exe(exe_lower: &str) -> bool {
        matches!(
            exe_lower,
            "svchost.exe"
                | "csrss.exe"
                | "smss.exe"
                | "wininit.exe"
                | "services.exe"
                | "lsass.exe"
                | "lsm.exe"
                | "winlogon.exe"
                | "dwm.exe"
                | "fontdrvhost.exe"
                | "conhost.exe"
                | "sihost.exe"
                | "ctfmon.exe"
                | "taskhostw.exe"
                | "runtimebroker.exe"
                | "shellexperiencehost.exe"
                | "startmenuexperiencehost.exe"
                | "searchhost.exe"
                | "searchindexer.exe"
                | "spoolsv.exe"
                | "audiodg.exe"
                | "wmiprvse.exe"
                | "dllhost.exe"
                | "registry"
                | "system"
                | "system idle process"
                | "memory compression"
                | "secure system"
                | "applicationframehost.exe"
                | "textinputhost.exe"
                | "widgetservice.exe"
                | "widgets.exe"
                | "taskmgr.exe"
                | "metrovpn.exe"
                | "xray.exe"
                | "tun2socks.exe"
        ) || exe_lower.starts_with("unins")
            || exe_lower.contains("uninstall")
            || exe_lower.contains("crashreporter")
            || exe_lower.contains("helper")
            || exe_lower.contains("updater")
    }

    fn pretty_app_name(exe: &str, raw_name: Option<&str>) -> String {
        if let Some(n) = raw_name {
            let cleaned = n.trim();
            if !cleaned.is_empty() && cleaned.len() <= 48 {
                return cleaned.to_string();
            }
        }
        let stem = exe
            .strip_suffix(".exe")
            .or_else(|| exe.strip_suffix(".EXE"))
            .unwrap_or(exe);
        let mut chars = stem.chars();
        match chars.next() {
            Some(c) => format!("{}{}", c.to_uppercase(), chars.as_str()),
            None => exe.to_string(),
        }
    }

    fn extract_exe_from_icon_or_path(raw: &str) -> Option<String> {
        let trimmed = raw.trim().trim_matches('"');
        let before_comma = trimmed.split(',').next().unwrap_or(trimmed).trim().trim_matches('"');
        if before_comma.to_lowercase().ends_with(".exe") {
            let fname = Path::new(before_comma).file_name()?.to_str()?.to_string();
            return Some(fname);
        }
        None
    }

    pub fn scan_installed_windows_apps(existing: &[WindowsAppRule]) -> Vec<WindowsAppRule> {
        let mut bypassed_map: BTreeMap<String, WindowsAppRule> = BTreeMap::new();
        for rule in existing {
            let key = rule.exe.to_lowercase();
            if rule.bypassed || rule.category == "Custom" {
                bypassed_map.insert(key, rule.clone());
            }
        }

        let mut running_exes: HashSet<String> = HashSet::new();
        let mut found: BTreeMap<String, (String, String, &'static str)> = BTreeMap::new();

        // 1. Scan active user processes via tasklist
        if let Ok(out) = Command::new("tasklist")
            .args(["/FO", "CSV", "/NH"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                let first_col = line.trim().trim_start_matches('"').split('"').next().unwrap_or("").trim();
                if first_col.to_lowercase().ends_with(".exe") {
                    let lower = first_col.to_lowercase();
                    if !is_noisy_system_exe(&lower) {
                        running_exes.insert(lower.clone());
                        found.entry(lower).or_insert_with(|| {
                            (pretty_app_name(first_col, None), first_col.to_string(), "Running")
                        });
                    }
                }
            }
        }

        // 2. Scan Windows Registry Uninstall entries (HKLM, WOW6432Node, HKCU)
        let uninstall_paths = [
            (RegKey::predef(HKEY_LOCAL_MACHINE), "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall"),
            (RegKey::predef(HKEY_LOCAL_MACHINE), "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall"),
            (RegKey::predef(HKEY_CURRENT_USER), "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall"),
        ];
        for (root, sub) in uninstall_paths {
            if let Ok(key) = root.open_subkey_with_flags(sub, KEY_READ) {
                for name_res in key.enum_keys() {
                    let Ok(sub_name) = name_res else { continue };
                    let Ok(app_key) = key.open_subkey_with_flags(&sub_name, KEY_READ) else {
                        continue;
                    };
                    let display_name: Option<String> = app_key.get_value("DisplayName").ok();
                    let exe_opt = app_key
                        .get_value::<String, _>("DisplayIcon")
                        .ok()
                        .and_then(|s| extract_exe_from_icon_or_path(&s))
                        .or_else(|| {
                            let loc: String = app_key.get_value("InstallLocation").ok()?;
                            let p = Path::new(loc.trim().trim_matches('"'));
                            if !p.is_dir() {
                                return None;
                            }
                            let entries = std::fs::read_dir(p).ok()?;
                            for e in entries.flatten() {
                                let path = e.path();
                                if path.extension().and_then(|x| x.to_str()).map(|x| x.eq_ignore_ascii_case("exe")).unwrap_or(false) {
                                    if let Some(fname) = path.file_name().and_then(|x| x.to_str()) {
                                        if !is_noisy_system_exe(&fname.to_lowercase()) {
                                            return Some(fname.to_string());
                                        }
                                    }
                                }
                            }
                            None
                        });
                    if let Some(exe) = exe_opt {
                        let lower = exe.to_lowercase();
                        if !is_noisy_system_exe(&lower) {
                            let cat = if running_exes.contains(&lower) { "Running" } else { "Installed" };
                            let label = pretty_app_name(&exe, display_name.as_deref());
                            found.insert(lower, (label, exe, cat));
                        }
                    }
                }
            }
        }

        // 3. Scan common Program Files / LocalAppData\Programs top folders
        let mut prog_dirs = Vec::new();
        for env_key in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
            if let Ok(val) = std::env::var(env_key) {
                let p = if env_key == "LOCALAPPDATA" {
                    Path::new(&val).join("Programs")
                } else {
                    Path::new(&val).to_path_buf()
                };
                if p.is_dir() {
                    prog_dirs.push(p);
                }
            }
        }
        for dir in prog_dirs {
            let Ok(entries) = std::fs::read_dir(&dir) else { continue };
            for entry in entries.flatten() {
                let sub = entry.path();
                if !sub.is_dir() {
                    continue;
                }
                let folder_name = sub.file_name().and_then(|s| s.to_str()).unwrap_or("");
                if folder_name.eq_ignore_ascii_case("WindowsApps")
                    || folder_name.starts_with("Windows ")
                    || folder_name.starts_with("Common Files")
                {
                    continue;
                }
                if let Ok(sub_entries) = std::fs::read_dir(&sub) {
                    for se in sub_entries.flatten() {
                        let sp = se.path();
                        if sp.extension().and_then(|x| x.to_str()).map(|x| x.eq_ignore_ascii_case("exe")).unwrap_or(false) {
                            if let Some(fname) = sp.file_name().and_then(|x| x.to_str()) {
                                let lower = fname.to_lowercase();
                                if !is_noisy_system_exe(&lower) {
                                    let cat = if running_exes.contains(&lower) { "Running" } else { "Installed" };
                                    found.entry(lower).or_insert_with(|| {
                                        (pretty_app_name(fname, Some(folder_name)), fname.to_string(), cat)
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        let mut merged: Vec<WindowsAppRule> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();

        for (lower, rule) in &bypassed_map {
            seen.insert(lower.clone());
            let cat = if rule.category == "Custom" {
                "Custom".to_string()
            } else if running_exes.contains(lower) {
                "Running".to_string()
            } else {
                "Installed".to_string()
            };
            merged.push(WindowsAppRule {
                id: rule.id.clone(),
                name: rule.name.clone(),
                exe: rule.exe.clone(),
                category: cat,
                bypassed: rule.bypassed,
            });
        }

        for (lower, (name, exe, cat)) in found {
            if seen.contains(&lower) {
                continue;
            }
            seen.insert(lower.clone());
            merged.push(WindowsAppRule {
                id: format!("app-{lower}"),
                name,
                exe,
                category: cat.to_string(),
                bypassed: false,
            });
        }

        merged.sort_by(|a, b| {
            b.bypassed
                .cmp(&a.bypassed)
                .then_with(|| (b.category == "Running").cmp(&(a.category == "Running")))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        merged.truncate(120);
        merged
    }

    pub fn capture_virtual_screen_rgba() -> Result<(u32, u32, Vec<u8>), String> {
        unsafe {
            let vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
            let vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
            let vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            let vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
            if vw <= 0 || vh <= 0 {
                return Err("Cannot query Windows screen dimensions".into());
            }

            let screen_dc = GetDC(std::ptr::null_mut());
            if screen_dc.is_null() {
                return Err("Failed to acquire screen device context".into());
            }
            let mem_dc = CreateCompatibleDC(screen_dc);
            if mem_dc.is_null() {
                ReleaseDC(std::ptr::null_mut(), screen_dc);
                return Err("Failed to create memory device context".into());
            }
            let bmp = CreateCompatibleBitmap(screen_dc, vw, vh);
            if bmp.is_null() {
                DeleteDC(mem_dc);
                ReleaseDC(std::ptr::null_mut(), screen_dc);
                return Err("Failed to create screen bitmap".into());
            }

            let old_obj = SelectObject(mem_dc, bmp);
            let copied = BitBlt(mem_dc, 0, 0, vw, vh, screen_dc, vx, vy, SRCCOPY);
            SelectObject(mem_dc, old_obj);
            ReleaseDC(std::ptr::null_mut(), screen_dc);

            if copied == 0 {
                DeleteObject(bmp);
                DeleteDC(mem_dc);
                return Err("BitBlt screen capture failed".into());
            }

            let mut bmi: BITMAPINFO = std::mem::zeroed();
            bmi.bmiHeader = BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: vw,
                biHeight: -vh,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            };

            let mut buf = vec![0u8; (vw as usize) * (vh as usize) * 4];
            let lines = GetDIBits(
                mem_dc,
                bmp,
                0,
                vh as u32,
                buf.as_mut_ptr() as *mut _,
                &mut bmi,
                DIB_RGB_COLORS,
            );
            DeleteObject(bmp);
            DeleteDC(mem_dc);

            if lines == 0 {
                return Err("GetDIBits failed to read captured pixels".into());
            }

            for chunk in buf.chunks_exact_mut(4) {
                chunk.swap(0, 2); // BGRA -> RGBA
                chunk[3] = 255;
            }
            Ok((vw as u32, vh as u32, buf))
        }
    }
}

#[cfg(not(windows))]
mod win_impl {
    use super::WindowsAppRule;
    use std::path::Path;
    pub const CREATE_NO_WINDOW: u32 = 0;

    pub fn acquire_single_instance_or_focus() -> bool {
        true
    }

    pub fn enable_system_proxy(
        backup_path: &Path,
        _http_port: u16,
        _bypass_lan: bool,
        _custom_exceptions: &str,
    ) -> Result<(), String> {
        if let Some(parent) = backup_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(backup_path, "{}");
        Ok(())
    }

    pub fn restore_system_proxy(backup_path: &Path) -> Result<bool, String> {
        if backup_path.exists() {
            let _ = std::fs::remove_file(backup_path);
            return Ok(true);
        }
        Ok(false)
    }

    pub fn is_elevated() -> bool {
        false
    }

    pub fn relaunch_as_admin() -> Result<(), String> {
        Err("UAC elevation is only supported on Windows 10/11".into())
    }

    pub fn kill_stale_core_processes() {}

    pub fn configure_tun_interface(
        _interface_name: &str,
        _server_host: &str,
        _dns_server: &str,
        _mtu: u16,
    ) -> Result<Vec<String>, String> {
        Ok(Vec::new())
    }

    pub fn teardown_tun_routes(_pinned_server_ips: &[String]) {}

    pub fn scan_installed_windows_apps(existing: &[WindowsAppRule]) -> Vec<WindowsAppRule> {
        existing.to_vec()
    }

    pub fn capture_virtual_screen_rgba() -> Result<(u32, u32, Vec<u8>), String> {
        Err("Screen capture QR is only supported on Windows".into())
    }
}

pub use win_impl::{
    acquire_single_instance_or_focus, capture_virtual_screen_rgba, configure_tun_interface,
    enable_system_proxy, is_elevated, kill_stale_core_processes, relaunch_as_admin,
    restore_system_proxy, scan_installed_windows_apps, teardown_tun_routes, CREATE_NO_WINDOW,
};

pub fn backup_file_path(app_data_dir: &Path) -> std::path::PathBuf {
    app_data_dir.join("proxy_backup.lock.json")
}
