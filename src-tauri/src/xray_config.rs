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

    let sniffing_obj = if settings.sniffing_enabled {
        json!({
            "enabled": true,
            "destOverride": ["http", "tls", "quic"],
            "routeOnly": settings.sniffing_route_only
        })
    } else {
        json!({
            "enabled": false
        })
    };

    let mut inbounds = vec![
        json!({
            "tag": "socks-in",
            "listen": listen_addr,
            "port": socks_port,
            "protocol": "socks",
            "settings": {
                "auth": "noauth",
                "udp": settings.udp_enabled
            },
            "sniffing": sniffing_obj.clone()
        }),
        json!({
            "tag": "http-in",
            "listen": listen_addr,
            "port": http_port,
            "protocol": "http",
            "sniffing": sniffing_obj
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
        let packets = if settings.fragment_packets.trim().is_empty() {
            "tlshello"
        } else {
            settings.fragment_packets.trim()
        };
        let length = if settings.fragment_length.trim().is_empty() {
            "10-50"
        } else {
            settings.fragment_length.trim()
        };
        let interval = if settings.fragment_interval.trim().is_empty() {
            "10-20"
        } else {
            settings.fragment_interval.trim()
        };

        outbounds.push(json!({
            "tag": "fragment-out",
            "protocol": "freedom",
            "settings": {
                "fragment": {
                    "packets": packets,
                    "length": length,
                    "interval": interval
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

    // Block Windows NetBIOS/mDNS multicast chatter (inspired by v2rayN SampleTunRules)
    routing_rules.push(json!({
        "type": "field",
        "network": "udp",
        "port": "135,137-139,5353",
        "outboundTag": "block"
    }));
    routing_rules.push(json!({
        "type": "field",
        "ip": ["224.0.0.0/3", "ff00::/8"],
        "outboundTag": "block"
    }));

    if !settings.ipv6_enabled {
        // Prevent IPv6 leaks when IPv6 dual-stack routing is disabled
        routing_rules.push(json!({
            "type": "field",
            "ip": ["::/0"],
            "outboundTag": "block"
        }));
    }

    if settings.routing_mode == "direct" {
        routing_rules.push(json!({
            "type": "field",
            "inboundTag": ["socks-in", "http-in"],
            "outboundTag": "direct"
        }));
    } else {
        if settings.bypass_lan && settings.routing_mode != "global" {
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

        let extra_cidrs: Vec<String> = settings
            .tun_exclude_cidrs
            .split([',', '\n', ';', ' '])
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if !extra_cidrs.is_empty() {
            routing_rules.push(json!({
                "type": "field",
                "ip": extra_cidrs,
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
    }

    let log_level = match settings.log_level.as_str() {
        "debug" | "info" | "warning" | "error" | "none" => settings.log_level.as_str(),
        _ => "warning",
    };

    let mut root = json!({
        "log": {
            "loglevel": log_level
        },
        "dns": {
            "servers": dns_servers,
            "queryStrategy": if settings.ipv6_enabled { "UseIP" } else { "UseIPv4" }
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
    let bootstrap = if settings.bootstrap_dns.trim().is_empty() {
        "1.1.1.1"
    } else {
        settings.bootstrap_dns.trim()
    };
    match settings.dns_resolver.as_str() {
        "Cloudflare 1.1.1.2" => vec![json!("https://1.1.1.2/dns-query"), json!(bootstrap)],
        "Google 8.8.8.8" => vec![json!("https://8.8.8.8/dns-query"), json!(bootstrap)],
        "Quad9 9.9.9.9" => vec![json!("https://9.9.9.9/dns-query"), json!(bootstrap)],
        "Custom DoH" => vec![
            json!(settings.custom_doh_url),
            json!(bootstrap),
        ],
        _ => vec![json!("https://1.1.1.1/dns-query"), json!(bootstrap)],
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

    let fp = if !node.fingerprint.is_empty() {
        node.fingerprint.as_str()
    } else if !settings.default_fingerprint.is_empty() {
        settings.default_fingerprint.as_str()
    } else {
        "chrome"
    };

    let mut stream_settings = json!({
        "network": node.transport,
        "security": security
    });

    if security == "reality" {
        stream_settings["realitySettings"] = json!({
            "show": false,
            "fingerprint": fp,
            "serverName": node.sni,
            "publicKey": node.public_key.clone().unwrap_or_default(),
            "shortId": node.short_id.clone().unwrap_or_default(),
            "spiderX": node.spider_x.clone().unwrap_or_else(|| "/".into())
        });
    } else if security == "tls" {
        let alpn_list: Vec<String> = if let Some(alpn) = &node.alpn {
            alpn.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        } else if node.transport == "ws" {
            // Avoid HTTP/2 upgrade 400 trap on WebSocket+TLS inbounds
            vec!["http/1.1".to_string()]
        } else {
            vec!["h2".to_string(), "http/1.1".to_string()]
        };

        let strict_verify = settings.tunnel_profile == "Strict VCN" && settings.cert_pinning;
        let allow_insecure = if strict_verify {
            false
        } else {
            node.allow_insecure || settings.allow_insecure_fallback
        };

        let mut tls_obj = json!({
            "serverName": node.sni,
            "allowInsecure": allow_insecure,
            "fingerprint": fp,
            "alpn": alpn_list
        });

        if let Some(vcn_host) = &node.vcn_host {
            if !vcn_host.is_empty() && settings.cert_pinning {
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

    let has_vision_flow = node
        .flow
        .as_deref()
        .map(|f| f.contains("vision"))
        .unwrap_or(false);

    let mut outbound = if is_vmess {
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
    };

    if settings.mux_enabled && !has_vision_flow {
        outbound["mux"] = json!({
            "enabled": true,
            "concurrency": settings.mux_concurrency.clamp(1, 32)
        });
    }

    outbound
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_vless_uri;

    #[test]
    fn test_xray_config_strict_vcn_and_lan_sharing() {
        let node = parse_vless_uri("vless://a94b7c12-e3f1-48a2-b910-81c450d912fa@1.2.3.4:443?encryption=none&security=tls&sni=st1.zoom.us&vcn=vpn.metrodens.site&fp=chrome&alpn=h2,http/1.1&flow=xtls-rprx-vision&type=tcp#SG-01%20SLT").unwrap();
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
        let node = parse_vless_uri("vless://a94b7c12-e3f1-48a2-b910-81c450d912fa@1.2.3.4:443?encryption=none&security=tls&sni=st1.zoom.us&type=tcp#SG-01").unwrap();
        let mut settings = AppSettings::default();
        settings.tunnel_profile = "TLS Frag".into();
        settings.fragment_length = "20-40".into();

        let cfg = build_xray_config(&node, &settings, SOCKS_PORT, HTTP_PORT, true);
        let outbounds = cfg["outbounds"].as_array().unwrap();
        assert_eq!(
            outbounds[0]["streamSettings"]["sockopt"]["dialerProxy"],
            "fragment-out"
        );
        let frag = outbounds.iter().find(|o| o["tag"] == "fragment-out").unwrap();
        assert_eq!(frag["settings"]["fragment"]["length"], "20-40");
    }
}
