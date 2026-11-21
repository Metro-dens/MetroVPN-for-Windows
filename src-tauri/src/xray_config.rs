use crate::models::{AppSettings, ServerNode};
use serde_json::{json, Value};

pub const SOCKS_PORT: u16 = 10808;
pub const HTTP_PORT: u16 = 10809;
pub const STATS_API_PORT: u16 = 10085;

pub fn build_xray_config(
    node: &ServerNode,
    settings: &AppSettings,
    socks_port: u16,
    http_port: u16,
    enable_api: bool,
) -> Value {
    let listen_addr = if settings.lan_proxy_sharing && enable_api {
        "0.0.0.0"
    } else {
        "127.0.0.1"
    };

    let mut inbounds = vec![
        json!({
            "tag": "socks-in",
            "listen": listen_addr,
            "port": socks_port,
            "protocol": "socks",
            "settings": {
                "auth": "noauth",
                "udp": true
            },
            "sniffing": {
                "enabled": true,
                "destOverride": ["http", "tls", "quic"]
            }
        }),
        json!({
            "tag": "http-in",
            "listen": listen_addr,
            "port": http_port,
            "protocol": "http",
            "sniffing": {
                "enabled": true,
                "destOverride": ["http", "tls"]
            }
        }),
    ];

    if enable_api {
        inbounds.push(json!({
            "tag": "api-in",
            "listen": "127.0.0.1",
            "port": STATS_API_PORT,
            "protocol": "dokodemo-door",
            "settings": {
                "address": "127.0.0.1"
            }
        }));
    }

    let proxy_outbound = build_proxy_outbound(node, settings);
    let mut outbounds = vec![
        proxy_outbound,
        json!({
            "tag": "direct",
            "protocol": "freedom",
            "settings": {}
        }),
        json!({
            "tag": "block",
            "protocol": "blackhole",
            "settings": {}
        }),
    ];

    if settings.tunnel_profile == "TLS Frag" {
        outbounds.push(json!({
            "tag": "fragment-out",
            "protocol": "freedom",
            "settings": {
                "fragment": {
                    "packets": "tlshello",
                    "length": "10-50",
                    "interval": "10-20"
                }
            }
        }));
    }

    let dns_servers = build_dns_servers(settings);
    let mut routing_rules = Vec::new();

    if enable_api {
        routing_rules.push(json!({
            "type": "field",
            "inboundTag": ["api-in"],
            "outboundTag": "api"
        }));
    }

    if settings.bypass_lan {
        routing_rules.push(json!({
            "type": "field",
            "ip": [
                "geoip:private",
                "127.0.0.0/8",
                "10.0.0.0/8",
                "172.16.0.0/12",
                "192.168.0.0/16"
            ],
            "outboundTag": "direct"
        }));
    }

    if settings.split_tunneling {
        let bypassed_exes: Vec<String> = settings
            .windows_apps
            .iter()
            .filter(|a| a.bypassed)
            .map(|a| a.exe.clone())
            .collect();
        if !bypassed_exes.is_empty() {
            routing_rules.push(json!({
                "type": "field",
                "process": bypassed_exes,
                "outboundTag": "direct"
            }));
        }
    }

    let mut root = json!({
        "log": {
            "loglevel": "info"
        },
        "dns": {
            "servers": dns_servers
        },
        "inbounds": inbounds,
        "outbounds": outbounds,
        "routing": {
            "domainStrategy": "IPIfNonMatch",
            "rules": routing_rules
        }
    });

    if enable_api {
        root["stats"] = json!({});
        root["api"] = json!({
            "tag": "api",
            "services": ["StatsService"]
        });
        root["policy"] = json!({
            "levels": {
                "0": {
                    "statsUserUplink": true,
                    "statsUserDownlink": true
                }
            },
            "system": {
                "statsInboundUplink": true,
                "statsInboundDownlink": true,
                "statsOutboundUplink": true,
                "statsOutboundDownlink": true
            }
        });
    }

    root
}

fn build_dns_servers(settings: &AppSettings) -> Vec<Value> {
    match settings.dns_resolver.as_str() {
        "Google 8.8.8.8" => vec![json!("https://8.8.8.8/dns-query"), json!("8.8.8.8")],
        "Quad9 9.9.9.9" => vec![json!("https://9.9.9.9/dns-query"), json!("9.9.9.9")],
        "Custom DoH" => vec![
            json!(settings.custom_doh_url),
            json!("1.1.1.1"),
        ],
        _ => vec![json!("https://1.1.1.1/dns-query"), json!("1.1.1.1")],
    }
}

fn build_proxy_outbound(node: &ServerNode, settings: &AppSettings) -> Value {
    if let Some(mut raw) = node.raw_outbound.clone() {
        raw["tag"] = json!("proxy");
        if settings.tunnel_profile == "TLS Frag" {
            if let Some(ss) = raw.get_mut("streamSettings") {
                ss["sockopt"] = json!({ "dialerProxy": "fragment-out" });
            }
        }
        return raw;
    }

    let is_vmess = node.uri.to_lowercase().starts_with("vmess://");
    let security = if node.tls_mode.is_empty() {
        "tls"
    } else {
        node.tls_mode.as_str()
    };

    let mut stream_settings = json!({
        "network": node.transport,
        "security": security
    });

    if security == "reality" {
        stream_settings["realitySettings"] = json!({
            "show": false,
            "fingerprint": node.fingerprint,
            "serverName": node.sni,
            "publicKey": node.public_key.clone().unwrap_or_default(),
            "shortId": node.short_id.clone().unwrap_or_default(),
            "spiderX": node.spider_x.clone().unwrap_or_else(|| "/".into())
        });
    } else if security == "tls" {
        let alpn_list: Vec<String> = if let Some(alpn) = &node.alpn {
            alpn.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
        } else if node.transport == "ws" {
            // Avoid HTTP/2 upgrade 400 trap on WebSocket+TLS inbounds
            vec!["http/1.1".to_string()]
        } else {
            vec!["h2".to_string(), "http/1.1".to_string()]
        };

        let strict_verify = settings.tunnel_profile == "Strict VCN" && settings.cert_pinning;
        let allow_insecure = if strict_verify { false } else { node.allow_insecure };

        let mut tls_obj = json!({
            "serverName": node.sni,
            "allowInsecure": allow_insecure,
            "fingerprint": if node.fingerprint.is_empty() { "chrome" } else { &node.fingerprint },
            "alpn": alpn_list
        });

        if let Some(vcn_host) = &node.vcn_host {
            if !vcn_host.is_empty() {
                tls_obj["verifyPeerCertByName"] = json!(vcn_host);
            }
        }
        stream_settings["tlsSettings"] = tls_obj;
    }

    match node.transport.as_str() {
        "ws" => {
            let mut ws = json!({
                "path": node.path.clone().unwrap_or_else(|| "/".into())
            });
            if let Some(h) = &node.host {
                ws["headers"] = json!({ "Host": h });
            } else {
                ws["headers"] = json!({ "Host": node.sni });
            }
            stream_settings["wsSettings"] = ws;
        }
        "grpc" => {
            stream_settings["grpcSettings"] = json!({
                "serviceName": node.service_name.clone().unwrap_or_else(|| "grpc".into())
            });
        }
        _ => {}
    }

    if settings.tunnel_profile == "TLS Frag" {
        stream_settings["sockopt"] = json!({
            "dialerProxy": "fragment-out"
        });
    }

    if is_vmess {
        json!({
            "tag": "proxy",
            "protocol": "vmess",
            "settings": {
                "vnext": [{
                    "address": node.address,
                    "port": node.port,
                    "users": [{
                        "id": node.uuid,
                        "alterId": 0,
                        "security": "auto"
                    }]
                }]
            },
            "streamSettings": stream_settings
        })
    } else {
        let mut user = json!({
            "id": node.uuid,
            "encryption": "none"
        });
        if let Some(flow) = &node.flow {
            if !flow.is_empty() && node.transport == "tcp" {
                user["flow"] = json!(flow);
            }
        }
        json!({
            "tag": "proxy",
            "protocol": "vless",
            "settings": {
                "vnext": [{
                    "address": node.address,
                    "port": node.port,
                    "users": [user]
                }]
            },
            "streamSettings": stream_settings
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::initial_seed_nodes;

    #[test]
    fn test_xray_config_strict_vcn_and_lan_sharing() {
        let node = initial_seed_nodes().remove(0);
        let mut settings = AppSettings::default();
        settings.lan_proxy_sharing = true;
        settings.tunnel_profile = "Strict VCN".into();
        settings.cert_pinning = true;

        let cfg = build_xray_config(&node, &settings, SOCKS_PORT, HTTP_PORT, true);
        let inbounds = cfg["inbounds"].as_array().unwrap();
        assert_eq!(inbounds[0]["listen"], "0.0.0.0");
        assert_eq!(inbounds[2]["port"], STATS_API_PORT);

        let proxy = &cfg["outbounds"][0];
        assert_eq!(
            proxy["streamSettings"]["tlsSettings"]["verifyPeerCertByName"],
            "vpn.metrodens.site"
        );
        assert_eq!(proxy["streamSettings"]["tlsSettings"]["allowInsecure"], false);
    }

    #[test]
    fn test_xray_config_tls_frag_adds_dialer_proxy() {
        let node = initial_seed_nodes().remove(0);
        let mut settings = AppSettings::default();
        settings.tunnel_profile = "TLS Frag".into();

        let cfg = build_xray_config(&node, &settings, SOCKS_PORT, HTTP_PORT, true);
        let outbounds = cfg["outbounds"].as_array().unwrap();
        assert_eq!(
            outbounds[0]["streamSettings"]["sockopt"]["dialerProxy"],
            "fragment-out"
        );
        assert!(outbounds.iter().any(|o| o["tag"] == "fragment-out"));
    }
}

