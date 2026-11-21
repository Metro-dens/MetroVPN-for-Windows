use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServerNode {
    pub id: String,
    pub name: String,
    pub region: String,
    pub isp: String,
    pub address: String,
    pub port: u16,
    pub uuid: String,
    pub sni: String,
    pub protocol: String,
    pub transport: String,
    pub tls_mode: String,
    pub vcn: bool,
    #[serde(default)]
    pub vcn_host: Option<String>,
    #[serde(default = "default_fp")]
    pub fingerprint: String,
    #[serde(default)]
    pub alpn: Option<String>,
    #[serde(default)]
    pub flow: Option<String>,
    #[serde(default)]
    pub public_key: Option<String>,
    #[serde(default)]
    pub short_id: Option<String>,
    #[serde(default)]
    pub spider_x: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub service_name: Option<String>,
    #[serde(default)]
    pub allow_insecure: bool,
    pub ping: Option<u64>,
    #[serde(rename = "quotaUsedGB")]
    pub quota_used_gb: f64,
    #[serde(rename = "quotaTotalGB")]
    pub quota_total_gb: f64,
    pub starred: bool,
    pub online: bool,
    pub ip: String,
    pub uri: String,
    #[serde(default)]
    pub raw_outbound: Option<serde_json::Value>,
}

fn default_fp() -> String {
    "chrome".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsAppRule {
    pub id: String,
    pub name: String,
    pub exe: String,
    pub category: String,
    pub bypassed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub system_mode: String,     // "TUN" | "PROXY"
    pub tunnel_profile: String,  // "Strict VCN" | "TLS Frag" | "Standard"
    pub lan_proxy_sharing: bool,
    pub split_tunneling: bool,
    pub bypass_lan: bool,
    pub dns_resolver: String,
    #[serde(default = "default_custom_doh")]
    pub custom_doh_url: String,
    pub mtu: u16,
    pub cert_pinning: bool,
    pub start_with_windows: bool,
    pub active_node_id: Option<String>,
    pub windows_apps: Vec<WindowsAppRule>,
}

fn default_custom_doh() -> String {
    "https://dns.quad9.net/dns-query".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            system_mode: "PROXY".to_string(),
            tunnel_profile: "Strict VCN".to_string(),
            lan_proxy_sharing: false,
            split_tunneling: true,
            bypass_lan: true,
            dns_resolver: "Cloudflare 1.1.1.1".to_string(),
            custom_doh_url: default_custom_doh(),
            mtu: 1420,
            cert_pinning: true,
            start_with_windows: false,
            active_node_id: None,
            windows_apps: default_windows_apps(),
        }
    }
}

pub fn default_windows_apps() -> Vec<WindowsAppRule> {
    vec![
        WindowsAppRule {
            id: "chrome".into(),
            name: "Google Chrome".into(),
            exe: "chrome.exe".into(),
            category: "Browser".into(),
            bypassed: false,
        },
        WindowsAppRule {
            id: "valorant".into(),
            name: "VALORANT".into(),
            exe: "VALORANT-Win64-Shipping.exe".into(),
            category: "Gaming".into(),
            bypassed: true,
        },
        WindowsAppRule {
            id: "steam".into(),
            name: "Steam Client".into(),
            exe: "steam.exe".into(),
            category: "Gaming".into(),
            bypassed: true,
        },
        WindowsAppRule {
            id: "discord".into(),
            name: "Discord".into(),
            exe: "Discord.exe".into(),
            category: "Comms".into(),
            bypassed: false,
        },
        WindowsAppRule {
            id: "vscode".into(),
            name: "Visual Studio Code".into(),
            exe: "Code.exe".into(),
            category: "Developer".into(),
            bypassed: false,
        },
        WindowsAppRule {
            id: "qbittorrent".into(),
            name: "qBittorrent".into(),
            exe: "qbittorrent.exe".into(),
            category: "Network".into(),
            bypassed: false,
        },
        WindowsAppRule {
            id: "onedrive".into(),
            name: "Microsoft OneDrive".into(),
            exe: "OneDrive.exe".into(),
            category: "System".into(),
            bypassed: true,
        },
        WindowsAppRule {
            id: "spotify".into(),
            name: "Spotify Desktop".into(),
            exe: "Spotify.exe".into(),
            category: "Media".into(),
            bypassed: true,
        },
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: String,
    pub time: String,
    pub tag: String,
    pub msg: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryPayload {
    pub down_bps: u64,
    pub up_bps: u64,
    pub total_down: u64,
    pub total_up: u64,
    pub elapsed_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VpnStatusPayload {
    pub status: String, // "Disconnected" | "Connecting" | "Connected" | "Error"
    pub message: Option<String>,
    pub active_node_id: Option<String>,
    pub system_mode: String,
    pub elapsed_secs: u64,
    pub local_lan_ip: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTestProgress {
    pub phase: String, // "ping" | "download" | "upload" | "complete" | "error"
    pub mbps: f64,
    pub progress_pct: f64,
    pub ping_ms: Option<u64>,
    pub jitter_ms: Option<f64>,
    pub download_mbps: Option<f64>,
    pub upload_mbps: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTestHistoryEntry {
    pub id: String,
    pub server_name: String,
    pub timestamp: String,
    pub ping: u64,
    pub jitter: f64,
    pub download: f64,
    pub upload: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    pub id: String,
    pub ping_ms: Option<u64>,
    pub online: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistedStore {
    pub servers: Vec<ServerNode>,
    pub settings: AppSettings,
    pub speed_history: Vec<SpeedTestHistoryEntry>,
}

pub fn initial_seed_nodes() -> Vec<ServerNode> {
    vec![
        ServerNode {
            id: "sg-01".into(),
            name: "SG-01 • SLT Fiber Direct".into(),
            region: "SG".into(),
            isp: "SLT Fiber".into(),
            address: "sg01.metrovpn.io".into(),
            port: 443,
            uuid: "a94b7c12-e3f1-48a2-b910-81c450d912fa".into(),
            sni: "st1.zoom.us".into(),
            protocol: "TCP • TLS+VCN".into(),
            transport: "tcp".into(),
            tls_mode: "tls".into(),
            vcn: true,
            vcn_host: Some("vpn.metrodens.site".into()),
            fingerprint: "chrome".into(),
            alpn: Some("h2,http/1.1".into()),
            flow: Some("xtls-rprx-vision".into()),
            public_key: None,
            short_id: None,
            spider_x: None,
            path: None,
            host: None,
            service_name: None,
            allow_insecure: false,
            ping: None,
            quota_used_gb: 0.0,
            quota_total_gb: 100.0,
            starred: true,
            online: false,
            ip: "sg01.metrovpn.io".into(),
            uri: "vless://a94b7c12-e3f1-48a2-b910-81c450d912fa@sg01.metrovpn.io:443?encryption=none&security=tls&sni=st1.zoom.us&vcn=vpn.metrodens.site&fp=chrome&alpn=h2,http/1.1&flow=xtls-rprx-vision&type=tcp#SG-01%20%E2%80%A2%20SLT%20Fiber%20Direct".into(),
            raw_outbound: None,
        },
    ]
}
