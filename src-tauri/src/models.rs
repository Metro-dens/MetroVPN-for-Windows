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
    #[serde(default)]
    pub quota_up_bytes: u64,
    #[serde(default)]
    pub quota_down_bytes: u64,
    #[serde(default)]
    pub quota_total_bytes: u64,
    #[serde(default)]
    pub quota_expiry_ms: u64,
    #[serde(default = "default_true")]
    pub quota_enabled: bool,
    #[serde(default)]
    pub quota_email: String,
    #[serde(default)]
    pub quota_updated_at_ms: u64,
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

    // General & Local Proxy settings (inspired by v2rayN & nekoray)
    #[serde(default = "default_socks_port")]
    pub socks_port: u16,
    #[serde(default = "default_http_port")]
    pub http_port: u16,
    #[serde(default = "default_true")]
    pub udp_enabled: bool,
    #[serde(default = "default_true")]
    pub sniffing_enabled: bool,
    #[serde(default)]
    pub sniffing_route_only: bool,
    #[serde(default = "default_proxy_exceptions")]
    pub system_proxy_exceptions: String,
    #[serde(default)]
    pub auto_connect_on_launch: bool,
    #[serde(default = "default_true")]
    pub close_to_tray: bool,

    // Routing, Fragment & TUN settings (inspired by v2rayN, nekoray, MetroVpn Android)
    #[serde(default = "default_routing_mode")]
    pub routing_mode: String, // "rule" | "global" | "direct"
    #[serde(default = "default_frag_packets")]
    pub fragment_packets: String,
    #[serde(default = "default_frag_length")]
    pub fragment_length: String,
    #[serde(default = "default_frag_interval")]
    pub fragment_interval: String,
    #[serde(default)]
    pub ipv6_enabled: bool,
    #[serde(default = "default_true")]
    pub tun_strict_route: bool,
    #[serde(default)]
    pub tun_exclude_cidrs: String,

    // DNS, Core & TLS Security settings
    #[serde(default = "default_bootstrap_dns")]
    pub bootstrap_dns: String,
    #[serde(default)]
    pub allow_insecure_fallback: bool,
    #[serde(default = "default_fp")]
    pub default_fingerprint: String,
    #[serde(default)]
    pub mux_enabled: bool,
    #[serde(default = "default_mux_concurrency")]
    pub mux_concurrency: u16,
    #[serde(default = "default_log_level")]
    pub log_level: String,

    // Subscriptions, Speedtest & First-Run Onboarding
    #[serde(default)]
    pub saved_subscriptions: Vec<String>,
    #[serde(default)]
    pub sub_use_proxy: bool,
    #[serde(default)]
    pub sub_clear_before_update: bool,
    #[serde(default = "default_latency_mode")]
    pub latency_mode: String, // "http_204" | "tcp_tls"
    #[serde(default = "default_latency_url")]
    pub latency_test_url: String,
    #[serde(default)]
    pub onboarding_completed: bool,
    #[serde(default = "default_true")]
    pub auto_check_updates: bool,
}

fn default_custom_doh() -> String {
    "https://dns.quad9.net/dns-query".to_string()
}

fn default_socks_port() -> u16 {
    10808
}

fn default_http_port() -> u16 {
    10809
}

fn default_true() -> bool {
    true
}

fn default_proxy_exceptions() -> String {
    "<local>;localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.2*;172.30.*;172.31.*;192.168.*".to_string()
}

fn default_routing_mode() -> String {
    "rule".to_string()
}

fn default_frag_packets() -> String {
    "tlshello".to_string()
}

fn default_frag_length() -> String {
    "10-50".to_string()
}

fn default_frag_interval() -> String {
    "10-20".to_string()
}

fn default_bootstrap_dns() -> String {
    "1.1.1.1".to_string()
}

fn default_mux_concurrency() -> u16 {
    8
}

fn default_log_level() -> String {
    "warning".to_string()
}

fn default_latency_mode() -> String {
    "http_204".to_string()
}

fn default_latency_url() -> String {
    "https://www.gstatic.com/generate_204".to_string()
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
            socks_port: default_socks_port(),
            http_port: default_http_port(),
            udp_enabled: true,
            sniffing_enabled: true,
            sniffing_route_only: false,
            system_proxy_exceptions: default_proxy_exceptions(),
            auto_connect_on_launch: false,
            close_to_tray: true,
            routing_mode: default_routing_mode(),
            fragment_packets: default_frag_packets(),
            fragment_length: default_frag_length(),
            fragment_interval: default_frag_interval(),
            ipv6_enabled: false,
            tun_strict_route: true,
            tun_exclude_cidrs: String::new(),
            bootstrap_dns: default_bootstrap_dns(),
            allow_insecure_fallback: false,
            default_fingerprint: default_fp(),
            mux_enabled: false,
            mux_concurrency: default_mux_concurrency(),
            log_level: default_log_level(),
            saved_subscriptions: Vec::new(),
            sub_use_proxy: false,
            sub_clear_before_update: false,
            latency_mode: default_latency_mode(),
            latency_test_url: default_latency_url(),
            onboarding_completed: false,
            auto_check_updates: true,
        }
    }
}

pub fn default_windows_apps() -> Vec<WindowsAppRule> {
    Vec::new()
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
    #[serde(default)]
    pub active_node_quota_used_gb: Option<f64>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseUpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
    pub download_url: String,
    pub asset_name: String,
    pub title: String,
    pub message: String,
    pub published_at: String,
    #[serde(default)]
    pub mandatory: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDownloadProgress {
    pub percent: u8,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub phase: String, // "downloading" | "ready" | "launching" | "error"
    pub file_path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistedStore {
    pub servers: Vec<ServerNode>,
    pub settings: AppSettings,
    pub speed_history: Vec<SpeedTestHistoryEntry>,
}

pub fn initial_seed_nodes() -> Vec<ServerNode> {
    Vec::new()
}
