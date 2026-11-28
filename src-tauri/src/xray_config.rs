use crate::models::{AppSettings, ServerNode};
use serde_json::{json, Value};

pub const SOCKS_PORT: u16 = 10808;
pub const HTTP_PORT: u16 = 10809;
pub const STATS_API_PORT: u16 = 10085;

#[derive(Debug, Default, Clone, Copy)]
pub struct XrayBuildOverrides<'a> {
    /// Pre-resolved server IPv4 used in TUN mode so Xray dials the pinned `/32`
    /// host route directly instead of triggering an OS DNS loop through Wintun.
    pub dial_ip_override: Option<&'a str>,
    /// Runtime-probed leaf certificate SHA-256 hex used in place of Xray 26.x's
    /// removed `"allowInsecure": true` option (`pinnedPeerCertSha256`).
    pub cert_pin_override: Option<&'a str>,
}

pub fn build_xray_config(
    node: &ServerNode,
    settings: &AppSettings,
    req_socks_port: u16,
    req_http_port: u16,
    enable_api: bool,
) -> Value {
    build_xray_config_with_overrides(
        node,
        settings,
        req_socks_port,
        req_http_port,
        enable_api,
        XrayBuildOverrides::default(),
    )
}

pub fn build_xray_config_with_overrides(
    node: &ServerNode,
    settings: &AppSettings,
    req_socks_port: u16,
    req_http_port: u16,
    enable_api: bool,
    overrides: XrayBuildOverrides<'_>,
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

    let mut socks_settings = json!({
        "auth": "noauth",
        "udp": settings.udp_enabled,
        "userLevel": 8
    });
    if settings.udp_enabled {
        // Explicit UDP bind IP guarantees SOCKS5 UDP ASSOCIATE (used by tun2socks for DNS)
        // returns a routable loopback address instead of 0.0.0.0 when LAN sharing is enabled.
        socks_settings["ip"] = json!("127.0.0.1");
    }

    let mut inbounds = vec![
        json!({
            "tag": "socks-in",
            "listen": listen_addr,
            "port": socks_port,
            "protocol": "socks",
            "settings": socks_settings,
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

    let security_is_tls_or_reality = {
        let s = node.tls_mode.trim().to_lowercase();
        s.is_empty() || s == "tls" || s == "xtls" || s == "reality"
    };
    let transport_is_udp = {
        let t = node.transport.trim().to_lowercase();
        t == "quic" || t == "kcp"
    };
    let use_tls_frag =
        settings.tunnel_profile == "TLS Frag" && security_is_tls_or_reality && !transport_is_udp;

    let proxy_outbound = build_proxy_outbound(node, settings, overrides, use_tls_frag);
    let mut outbounds = vec![proxy_outbound];

    if use_tls_frag {
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
        if (settings.bypass_lan && settings.routing_mode != "global") || settings.lan_proxy_sharing {
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

        // Explicit final catch-all rule: forward all remaining traffic into the VPN proxy.
        // Because domainStrategy is "AsIs", domain destinations go straight to the remote VPN
        // server without Xray attempting direct host UDP:53 lookups (which deadlock in Windows TUN mode
        // and fail on Sri Lanka ISP zero-rating packages).
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
            "domainStrategy": "AsIs",
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

fn is_valid_domain_name(candidate: &str) -> bool {
    let c = candidate.trim();
    !c.is_empty() && c.parse::<std::net::IpAddr>().is_err() && !c.contains('/') && !c.contains(' ')
}

fn push_unique_domain(list: &mut Vec<String>, raw: &str) {
    let clean = raw.trim();
    if is_valid_domain_name(clean) && !list.iter().any(|x| x.eq_ignore_ascii_case(clean)) {
        list.push(clean.to_string());
    }
}

fn sanitize_raw_outbound_for_xray26(
    mut raw: Value,
    overrides: XrayBuildOverrides<'_>,
    use_tls_frag: bool,
) -> Value {
    raw["tag"] = json!("proxy");

    // Xray-core v26.x removed allowInsecure: true (exit 23); replace with pinnedPeerCertSha256 if available
    if let Some(ss) = raw.get_mut("streamSettings") {
        if let Some(tls) = ss.get_mut("tlsSettings").and_then(|v| v.as_object_mut()) {
            tls.remove("allowInsecure");
            if let Some(pin) = overrides.cert_pin_override.filter(|p| !p.trim().is_empty()) {
                tls.insert("pinnedPeerCertSha256".to_string(), json!(pin.trim()));
                tls.remove("verifyPeerCertByName");
            }
        }
        if ss.get("network").and_then(|v| v.as_str()) == Some("http") {
            let path = ss
                .get("httpSettings")
                .and_then(|h| h.get("path"))
                .and_then(|p| p.as_str())
                .unwrap_or("/")
                .to_string();
            let host = ss
                .get("httpSettings")
                .and_then(|h| h.get("host"))
                .and_then(|arr| arr.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            ss["network"] = json!("xhttp");
            if let Some(obj) = ss.as_object_mut() {
                obj.remove("httpSettings");
            }
            let mut xh = json!({ "path": path, "mode": "stream-one" });
            if !host.is_empty() {
                xh["host"] = json!(host);
            }
            ss["xhttpSettings"] = xh;
        }
        if use_tls_frag {
            ss["sockopt"] = json!({ "dialerProxy": "fragment-out" });
        }
    }

    if let Some(dial_ip) = overrides.dial_ip_override.filter(|ip| !ip.trim().is_empty()) {
        if let Some(vnext) = raw
            .get_mut("settings")
            .and_then(|s| s.get_mut("vnext"))
            .and_then(|v| v.as_array_mut())
        {
            if let Some(first) = vnext.first_mut() {
                first["address"] = json!(dial_ip);
            }
        }
        if let Some(servers) = raw
            .get_mut("settings")
            .and_then(|s| s.get_mut("servers"))
            .and_then(|v| v.as_array_mut())
        {
            if let Some(first) = servers.first_mut() {
                first["address"] = json!(dial_ip);
            }
        }
    }

    raw
}

fn build_proxy_outbound(
    node: &ServerNode,
    settings: &AppSettings,
    overrides: XrayBuildOverrides<'_>,
    use_tls_frag: bool,
) -> Value {
    if let Some(raw) = node.raw_outbound.clone() {
        return sanitize_raw_outbound_for_xray26(raw, overrides, use_tls_frag);
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
    // Xray-core v26.x removed legacy "http" (H2) transport; migrate h2/http -> xhttp stream-one
    let is_legacy_h2 = transport == "h2" || transport == "http";
    let stream_network = if transport == "splithttp" || is_legacy_h2 {
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
        let alpn_list: Vec<String> = if transport == "ws" || transport == "httpupgrade" {
            // ALWAYS force http/1.1 on WebSocket & HTTPUpgrade transports to prevent HTTP/2 400
            // upgrade rejections even if the imported URI mistakenly included alpn=h2,http/1.1.
            vec!["http/1.1".to_string()]
        } else if let Some(alpn) = &node.alpn {
            let parsed: Vec<String> = alpn
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            if parsed.is_empty() {
                if transport == "grpc" {
                    vec!["h2".to_string()]
                } else {
                    vec!["h2".to_string(), "http/1.1".to_string()]
                }
            } else {
                parsed
            }
        } else if transport == "grpc" {
            vec!["h2".to_string()]
        } else {
            vec!["h2".to_string(), "http/1.1".to_string()]
        };

        // Resolve certificate pin (explicit pcs= from URI OR runtime-probed leaf SHA-256 for
        // allowInsecure=1 / self-signed / IP-only TLS nodes).
        // IMPORTANT: NEVER emit "allowInsecure": true because Xray-core v26.11.9 removed it and
        // hard-exits with code 23 if present!
        let effective_pin: Option<String> = overrides
            .cert_pin_override
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .or_else(|| {
                node.pinned_cert_sha256
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string)
            });

        let mut tls_obj = json!({
            "serverName": effective_sni,
            "fingerprint": fp,
            "alpn": alpn_list
        });

        if let Some(pin_hex) = effective_pin {
            tls_obj["pinnedPeerCertSha256"] = json!(pin_hex);
        } else {
            let explicit_vcn_host = node
                .vcn_host
                .as_deref()
                .map(str::trim)
                .filter(|h| !h.is_empty())
                .map(str::to_string);

            let verify_peer_names: Option<String> = explicit_vcn_host.or_else(|| {
                let mut candidates = Vec::new();
                push_unique_domain(&mut candidates, &node.address);
                if let Some(h) = &node.host {
                    push_unique_domain(&mut candidates, h);
                }
                push_unique_domain(&mut candidates, effective_sni);

                if candidates.len() >= 2
                    || (candidates.len() == 1
                        && !candidates[0].eq_ignore_ascii_case(effective_sni))
                {
                    Some(candidates.join(","))
                } else {
                    None
                }
            });

            if let Some(peer_names) = verify_peer_names {
                tls_obj["verifyPeerCertByName"] = json!(peer_names);
            }
        }
        stream_settings["tlsSettings"] = tls_obj;
    }

    let sanitized_vcn_host = node.vcn_host.as_deref().and_then(|raw| {
        raw.split(',')
            .map(str::trim)
            .find(|h| !h.is_empty() && !h.contains('*') && !h.contains(' ') && !h.contains('/'))
    });

    let host_header = node
        .host
        .as_deref()
        .map(str::trim)
        .filter(|h| !h.is_empty())
        .or(sanitized_vcn_host)
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
            let default_mode = if is_legacy_h2 { "stream-one" } else { "auto" };
            let mut xh = json!({
                "path": path_str,
                "mode": node.mode.as_deref().filter(|m| !m.trim().is_empty()).unwrap_or(default_mode)
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

    if use_tls_frag {
        stream_settings["sockopt"] = json!({
            "dialerProxy": "fragment-out"
        });
    }

    let dial_address = overrides
        .dial_ip_override
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(node.address.as_str());

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
                    "address": dial_address,
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
                    "address": dial_address,
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
            if !flow.is_empty()
                && transport == "tcp"
                && (security == "tls" || security == "reality")
            {
                user["flow"] = json!(flow);
            }
        }
        json!({
            "tag": "proxy",
            "protocol": "vless",
            "settings": {
                "vnext": [{
                    "address": dial_address,
                    "port": node.port,
                    "users": [user]
                }]
            },
            "streamSettings": stream_settings
        })
    };

    if settings.mux_enabled && !has_vision_flow && stream_network != "xhttp" {
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
        assert_eq!(inbounds[0]["settings"]["ip"], "127.0.0.1");
        assert_eq!(inbounds[2]["port"], STATS_API_PORT);
        assert_eq!(cfg["routing"]["domainStrategy"], "AsIs");

        let proxy = &cfg["outbounds"][0];
        let tls = &proxy["streamSettings"]["tlsSettings"];
        assert_eq!(tls["verifyPeerCertByName"], "vpn.metrodens.site");
        assert!(tls.get("allowInsecure").is_none());
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
    fn test_xray_config_infers_vcn_for_spoofed_sni_domain_and_tun_dial_ip() {
        let node = parse_vless_uri("vless://7f3bd91d-9110-45ac-aec9-304c74e49e83@vpn.metrodens.site:443?encryption=none&type=tcp&headerType=none&security=tls&fp=chrome&sni=st1.zoom.us&alpn=h2%2Chttp%2F1.1#SLT%20Fiber%20-%20Zoom%20Meet%20Max%20%2F%20Lite-SLT-FIBER-ZOOM-VIP-%40METRODENZ-122").unwrap();
        let settings = AppSettings::default();
        let cfg = build_xray_config_with_overrides(
            &node,
            &settings,
            SOCKS_PORT,
            HTTP_PORT,
            true,
            XrayBuildOverrides {
                dial_ip_override: Some("185.100.10.20"),
                cert_pin_override: None,
            },
        );
        let proxy = &cfg["outbounds"][0];
        let tls = &proxy["streamSettings"]["tlsSettings"];
        assert_eq!(proxy["settings"]["vnext"][0]["address"], "185.100.10.20");
        assert_eq!(tls["serverName"], "st1.zoom.us");
        assert_eq!(tls["verifyPeerCertByName"], "vpn.metrodens.site,st1.zoom.us");
        assert!(tls.get("allowInsecure").is_none());
        assert_eq!(tls["fingerprint"], "chrome");
        assert_eq!(tls["alpn"], json!(["h2", "http/1.1"]));
        assert_eq!(proxy["streamSettings"]["network"], "tcp");
        assert_eq!(proxy["streamSettings"]["tcpSettings"]["header"]["type"], "none");
    }

    #[test]
    fn test_xray_config_never_emits_allow_insecure_and_supports_cert_pin() {
        let node = parse_vless_uri("vless://11111111-2222-3333-4444-555555555555@170.114.52.22:443?type=ws&host=zoom.metrodens.site&path=%2F&security=tls&sni=zoom.metrodens.site&alpn=h2,http/1.1&allowInsecure=1#CF-WS").unwrap();
        let settings = AppSettings::default();
        let cfg = build_xray_config_with_overrides(
            &node,
            &settings,
            SOCKS_PORT,
            HTTP_PORT,
            true,
            XrayBuildOverrides {
                dial_ip_override: None,
                cert_pin_override: Some("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"),
            },
        );
        let tls = &cfg["outbounds"][0]["streamSettings"]["tlsSettings"];
        assert!(tls.get("allowInsecure").is_none());
        assert_eq!(
            tls["pinnedPeerCertSha256"],
            "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
        );
        assert_eq!(tls["alpn"], json!(["http/1.1"]));
    }

    #[test]
    fn test_xray_config_migrates_h2_to_xhttp_stream_one() {
        let node = parse_vless_uri("vless://11111111-2222-3333-4444-555555555555@vpn.metrodens.site:443?type=h2&path=%2Fh2&security=tls&sni=vpn.metrodens.site#H2-Node").unwrap();
        let settings = AppSettings::default();
        let cfg = build_xray_config(&node, &settings, SOCKS_PORT, HTTP_PORT, true);
        let ss = &cfg["outbounds"][0]["streamSettings"];
        assert_eq!(ss["network"], "xhttp");
        assert_eq!(ss["xhttpSettings"]["mode"], "stream-one");
        assert_eq!(ss["xhttpSettings"]["path"], "/h2");
    }
}
