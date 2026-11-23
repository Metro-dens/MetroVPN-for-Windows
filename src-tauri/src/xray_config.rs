use crate::models::{AppSettings, ServerNode};
use serde_json::{json, Value};

pub const SOCKS_PORT: u16 = 10808;
pub const HTTP_PORT: u16 = 10809;
pub const STATS_API_PORT: u16 = 10085;

pub fn build_xray_config(
    node: &ServerNode,
    settings: &AppSettings,
    req_socks_port: u16,
    req_http_port: u16,
    enable_api: bool,
) -> Value {
    let socks_port = if enable_api { SOCKS_PORT } else { req_socks_port };
    let http_port = if enable_api { HTTP_PORT } else { req_http_port };
    let listen_addr = if settings.lan_proxy_sharing && enable_api {
        "0.0.0.0"
    } else {
        "127.0.0.1"
    };

    let sniffing_socks = if settings.sniffing_enabled {
        json!({
            "enabled": true,
            "destOverride": ["http", "tls", "quic"],
            "routeOnly": settings.sniffing_route_only
        })
    } else {
        json!({ "enabled": false })
    };

    let sniffing_http = if settings.sniffing_enabled {
        json!({
            "enabled": true,
            "destOverride": ["http", "tls"],
            "routeOnly": settings.sniffing_route_only
        })
    } else {
        json!({ "enabled": false })
    };

    let mut inbounds = vec![
        json!({
            "tag": "socks-in",
            "listen": listen_addr,
            "port": socks_port,
            "protocol": "socks",
            "settings": {
                "auth": "noauth",
                "udp": true,
                "userLevel": 8
            },
            "sniffing": sniffing_socks
        }),
        json!({
            "tag": "http-in",
            "listen": listen_addr,
            "port": http_port,
            "protocol": "http",
            "settings": {
                "allowTransparent": false,
                "userLevel": 8
            },
            "sniffing": sniffing_http
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
    let mut outbounds = vec![proxy_outbound];

    if settings.tunnel_profile == "TLS Frag" {
        let packets = if settings.fragment_packets.trim().is_empty() {
            "tlshello"
        } else {
            settings.fragment_packets.trim()
        };
        let length = if settings.fragment_length.trim().is_empty() {
            "10-20"
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

    outbounds.push(json!({
        "tag": "direct",
        "protocol": "freedom",
        "settings": {}
    }));
    outbounds.push(json!({
        "tag": "block",
        "protocol": "blackhole",
        "settings": {}
    }));

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

        // Explicit final catch-all rule matching Android XrayConfigBuilder.kt
        routing_rules.push(json!({
            "type": "field",
            "inboundTag": ["socks-in", "http-in"],
            "outboundTag": "proxy"
        }));
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
                    "handshake": 4,
                    "connIdle": 120,
                    "uplinkOnly": 0,
                    "downlinkOnly": 0,
                    "statsUserUplink": true,
                    "statsUserDownlink": true
                },
                "8": {
                    "handshake": 4,
                    "connIdle": 120,
                    "uplinkOnly": 0,
                    "downlinkOnly": 0,
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
    // Plain IP DNS resolvers first (like Android XrayConfigBuilder) so Xray never deadlocks on DoH bootstrap over ISP zero-rating packages
    match settings.dns_resolver.as_str() {
        "Cloudflare 1.1.1.2" => vec![json!("1.1.1.2"), json!("1.0.0.2"), json!(bootstrap)],
        "Google 8.8.8.8" => vec![json!("8.8.8.8"), json!("8.8.4.4"), json!(bootstrap)],
        "Quad9 9.9.9.9" => vec![json!("9.9.9.9"), json!("1.1.1.1")],
        "Custom DoH" => {
            if settings.custom_doh_url.trim().is_empty() {
                vec![json!("1.1.1.1"), json!("8.8.8.8")]
            } else {
                vec![json!(bootstrap), json!(settings.custom_doh_url.trim()), json!("8.8.8.8")]
            }
        }
        _ => vec![json!("1.1.1.1"), json!("8.8.8.8")],
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

    let uri_lower = node.uri.to_lowercase();
    let is_vmess = uri_lower.starts_with("vmess://");
    let is_trojan = uri_lower.starts_with("trojan://");

    let security_owned = if node.tls_mode.trim().is_empty() {
        "tls".to_string()
    } else {
        let s = node.tls_mode.trim().to_lowercase();
        if s == "xtls" { "tls".to_string() } else { s }
    };
    let security = security_owned.as_str();

    let transport_owned = {
        let t = node.transport.trim().to_lowercase();
        if t.is_empty() || t == "raw" {
            "tcp".to_string()
        } else {
            t
        }
    };
    let transport = transport_owned.as_str();
    let stream_network = if transport == "splithttp" {
        "xhttp"
    } else {
        transport
    };

    let fp = if !node.fingerprint.is_empty() {
        node.fingerprint.as_str()
    } else if !settings.default_fingerprint.is_empty() {
        settings.default_fingerprint.as_str()
    } else {
        "chrome"
    };

    let effective_sni = if node.sni.trim().is_empty() {
        node.address.as_str()
    } else {
        node.sni.trim()
    };

    let mut stream_settings = json!({
        "network": stream_network,
        "security": security
    });

    if security == "reality" {
        stream_settings["realitySettings"] = json!({
            "show": false,
            "fingerprint": fp,
            "serverName": effective_sni,
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
        } else if transport == "ws" || transport == "httpupgrade" {
            // Avoid HTTP/2 upgrade mismatch on WebSocket & HTTPUpgrade transports
            vec!["http/1.1".to_string()]
        } else {
            vec!["h2".to_string(), "http/1.1".to_string()]
        };

        let explicit_vcn_host = node
            .vcn_host
            .as_deref()
            .map(str::trim)
            .filter(|h| !h.is_empty())
            .map(str::to_string);

        // If no explicit vcn= parameter was supplied on a domain+TLS link where server address != SNI,
        // allow either the address domain cert (e.g. direct spoofed-SNI servers) OR the SNI domain cert
        // (e.g. CDN / Cloudflare / reverse proxies) using Xray's comma-separated verifyPeerCertByName.
        let verify_peer_names: Option<String> = explicit_vcn_host.or_else(|| {
            if !node.allow_insecure
                && node.address.parse::<std::net::IpAddr>().is_err()
                && !node.address.eq_ignore_ascii_case(effective_sni)
            {
                Some(format!("{},{}", node.address, effective_sni))
            } else {
                None
            }
        });

        let has_vcn_pin = node.vcn && verify_peer_names.is_some();
        let allow_insecure = if has_vcn_pin && settings.cert_pinning {
            false
        } else {
            node.allow_insecure || settings.allow_insecure_fallback
        };

        let mut tls_obj = json!({
            "serverName": effective_sni,
            "allowInsecure": allow_insecure,
            "fingerprint": fp,
            "alpn": alpn_list
        });

        if let Some(peer_names) = verify_peer_names {
            if settings.cert_pinning {
                tls_obj["verifyPeerCertByName"] = json!(peer_names);
            }
        }
        stream_settings["tlsSettings"] = tls_obj;
    }

    let host_header = node
        .host
        .as_deref()
        .map(str::trim)
        .filter(|h| !h.is_empty())
        .or_else(|| {
            node.vcn_host
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
        })
        .unwrap_or(effective_sni);

    let path_str = node
        .path
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .unwrap_or("/");

    match stream_network {
        "ws" => {
            let mut ws = json!({
                "path": path_str
            });
            if !host_header.is_empty() {
                ws["host"] = json!(host_header);
            }
            stream_settings["wsSettings"] = ws;
        }
        "httpupgrade" => {
            let mut hu = json!({
                "path": path_str
            });
            if !host_header.is_empty() {
                hu["host"] = json!(host_header);
            }
            stream_settings["httpupgradeSettings"] = hu;
        }
        "xhttp" => {
            let mut xh = json!({
                "path": path_str,
                "mode": node.mode.as_deref().filter(|m| !m.trim().is_empty()).unwrap_or("auto")
            });
            if !host_header.is_empty() {
                xh["host"] = json!(host_header);
            }
            if let Some(extra_raw) = &node.extra {
                if let Ok(extra_val) = serde_json::from_str::<Value>(extra_raw.trim()) {
                    xh["extra"] = extra_val;
                }
            }
            stream_settings["xhttpSettings"] = xh;
        }
        "h2" | "http" => {
            stream_settings["network"] = json!("http");
            let hosts = if host_header.is_empty() {
                Vec::<String>::new()
            } else {
                vec![host_header.to_string()]
            };
            stream_settings["httpSettings"] = json!({
                "path": path_str,
                "host": hosts
            });
        }
        "tcp" => {
            let header_t = node
                .header_type
                .as_deref()
                .map(str::trim)
                .unwrap_or("none")
                .to_lowercase();
            if header_t == "http" {
                let req_host = if host_header.is_empty() {
                    node.address.as_str()
                } else {
                    host_header
                };
                stream_settings["tcpSettings"] = json!({
                    "header": {
                        "type": "http",
                        "request": {
                            "version": "1.1",
                            "method": "GET",
                            "path": [path_str],
                            "headers": {
                                "Host": [req_host]
                            }
                        }
                    }
                });
            } else {
                stream_settings["tcpSettings"] = json!({
                    "header": { "type": "none" }
                });
            }
        }
        "grpc" => {
            let multi_mode = node
                .mode
                .as_deref()
                .map(|m| m.eq_ignore_ascii_case("multi"))
                .unwrap_or(false);
            let mut grpc = json!({
                "serviceName": node.service_name.clone().unwrap_or_else(|| "grpc".into()),
                "multiMode": multi_mode
            });
            if let Some(auth) = &node.authority {
                if !auth.trim().is_empty() {
                    grpc["authority"] = json!(auth.trim());
                }
            }
            stream_settings["grpcSettings"] = grpc;
        }
        "kcp" => {
            let mut kcp = json!({
                "header": {
                    "type": node.header_type.clone().unwrap_or_else(|| "none".into())
                }
            });
            if let Some(seed) = &node.seed {
                if !seed.trim().is_empty() {
                    kcp["seed"] = json!(seed.trim());
                }
            }
            stream_settings["kcpSettings"] = kcp;
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
                        "security": node.encryption.clone().unwrap_or_else(|| "auto".into()),
                        "level": 8
                    }]
                }]
            },
            "streamSettings": stream_settings
        })
    } else if is_trojan {
        json!({
            "tag": "proxy",
            "protocol": "trojan",
            "settings": {
                "servers": [{
                    "address": node.address,
                    "port": node.port,
                    "password": node.uuid,
                    "level": 8
                }]
            },
            "streamSettings": stream_settings
        })
    } else {
        let mut user = json!({
            "id": node.uuid,
            "encryption": node.encryption.clone().unwrap_or_else(|| "none".into()),
            "level": 8
        });
        if let Some(flow) = &node.flow {
            if !flow.is_empty() && transport == "tcp" {
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

    #[test]
    fn test_xray_config_infers_vcn_for_spoofed_sni_domain() {
        let node = parse_vless_uri("vless://7f3bd91d-9110-45ac-aec9-304c74e49e83@vpn.metrodens.site:443?encryption=none&type=tcp&headerType=none&security=tls&fp=chrome&sni=st1.zoom.us&alpn=h2%2Chttp%2F1.1#SLT%20Fiber%20-%20Zoom%20Meet%20Max%20%2F%20Lite-SLT-FIBER-ZOOM-VIP-%40METRODENZ-122").unwrap();
        let settings = AppSettings::default();
        let cfg = build_xray_config(&node, &settings, SOCKS_PORT, HTTP_PORT, true);
        let proxy = &cfg["outbounds"][0];
        let tls = &proxy["streamSettings"]["tlsSettings"];
        assert_eq!(tls["serverName"], "st1.zoom.us");
        assert_eq!(tls["verifyPeerCertByName"], "vpn.metrodens.site,st1.zoom.us");
        assert_eq!(tls["allowInsecure"], false);
        assert_eq!(tls["fingerprint"], "chrome");
        assert_eq!(tls["alpn"], json!(["h2", "http/1.1"]));
        assert_eq!(proxy["streamSettings"]["network"], "tcp");
        assert_eq!(proxy["streamSettings"]["tcpSettings"]["header"]["type"], "none");
    }
}
