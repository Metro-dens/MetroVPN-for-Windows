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
    use super::ProxyBackup;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::process::CommandExt;
    use std::path::Path;
    use std::process::Command;
    use windows_sys::Win32::Networking::WinInet::{
        InternetSetOptionW, INTERNET_OPTION_REFRESH, INTERNET_OPTION_SETTINGS_CHANGED,
    };
    use windows_sys::Win32::UI::Shell::{IsUserAnAdmin, ShellExecuteW};
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

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

    pub fn relaunch_as_admin() -> Result<(), String> {
        let exe = std::env::current_exe()
            .map_err(|e| format!("Failed to resolve current executable: {e}"))?;
        let verb = to_wide("runas");
        let file = to_wide(&exe.to_string_lossy());
        let res = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                file.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            )
        };
        if (res as isize) <= 32 {
            return Err("UAC elevation was cancelled or denied by Windows".into());
        }
        Ok(())
    }

    pub fn configure_tun_interface(
        interface_name: &str,
        server_host: &str,
        dns_server: &str,
        mtu: u16,
    ) -> Result<Vec<String>, String> {
        // Resolve physical default gateway before adding split default route
        let gw_output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' | Where-Object { $_.NextHop -ne '0.0.0.0' -and $_.InterfaceAlias -ne 'Metrovpn-TUN' } | Sort-Object RouteMetric | Select-Object -First 1).NextHop",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to query default gateway: {e}"))?;
        let orig_gw = String::from_utf8_lossy(&gw_output.stdout).trim().to_string();

        // Assign non-persistent static IP (store=active) without adding a competing 0.0.0.0/0 gateway
        let _ = Command::new("netsh")
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
            .output();

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

        // Route all IPv4 traffic via split-default prefix into Metrovpn-TUN
        let _ = Command::new("route")
            .args(["add", "0.0.0.0", "mask", "128.0.0.0", "198.18.0.2", "metric", "5"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        let _ = Command::new("route")
            .args(["add", "128.0.0.0", "mask", "128.0.0.0", "198.18.0.2", "metric", "5"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

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
}

#[cfg(not(windows))]
mod win_impl {
    use std::path::Path;
    pub const CREATE_NO_WINDOW: u32 = 0;

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

    pub fn configure_tun_interface(
        _interface_name: &str,
        _server_host: &str,
        _dns_server: &str,
        _mtu: u16,
    ) -> Result<Vec<String>, String> {
        Ok(Vec::new())
    }

    pub fn teardown_tun_routes(_pinned_server_ips: &[String]) {}
}

pub use win_impl::{
    configure_tun_interface, enable_system_proxy, is_elevated, relaunch_as_admin,
    restore_system_proxy, teardown_tun_routes, CREATE_NO_WINDOW,
};

pub fn backup_file_path(app_data_dir: &Path) -> std::path::PathBuf {
    app_data_dir.join("proxy_backup.lock.json")
}
