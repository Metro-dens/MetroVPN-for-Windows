use crate::models::ServerNode;
use base64::engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD};
use base64::Engine;
use serde_json::Value;
use std::collections::HashMap;
use url::Url;
use uuid::Uuid;

fn decode_b64_flexible(input: &str) -> Result<Vec<u8>, String> {
    let cleaned = input.trim().replace(['\r', '\n', ' '], "");
    STANDARD
        .decode(&cleaned)
        .or_else(|_| STANDARD_NO_PAD.decode(&cleaned))
        .or_else(|_| URL_SAFE.decode(&cleaned))
        .or_else(|_| URL_SAFE_NO_PAD.decode(&cleaned))
        .map_err(|e| format!("Invalid Base64 payload: {e}"))
}

fn infer_region(name: &str, host: &str) -> String {
    let letters: String = name
        .chars()
        .take(2)
        .filter(|c| c.is_ascii_alphabetic())
        .collect::<String>()
        .to_uppercase();
    if letters.len() == 2 {
        return letters;
    }
    let lower = format!("{name} {host}").to_lowercase();
    if lower.contains("singapore") || lower.contains("sg") {
        "SG".into()
    } else if lower.contains("tokyo") || lower.contains("jp") {
        "JP".into()
    } else if lower.contains("frankfurt") || lower.contains("de") {
        "DE".into()
    } else if lower.contains("mumbai") || lower.contains("india") || lower.contains("in-") {
        "IN".into()
    } else if lower.contains("london") || lower.contains("uk") || lower.contains("gb") {
        "GB".into()
    } else if lower.contains("hong kong") || lower.contains("hk") {
        "HK".into()
    } else if lower.contains("amsterdam") || lower.contains("nl") {
        "NL".into()
    } else if lower.contains("us") || lower.contains("america") {
        "US".into()
    } else {
        "SG".into()
    }
}

fn infer_isp(name: &str, sni: &str) -> String {
    let lower = format!("{name} {sni}").to_lowercase();
    if lower.contains("mobitel") {
        "Mobitel".into()
    } else if lower.contains("dialog") {
        "Dialog".into()
    } else if lower.contains("hutch") {
        "Hutch".into()
    } else if lower.contains("airtel") {
        "Airtel".into()
    } else if lower.contains("slt") || lower.contains("stl") || lower.contains("fiber") {
        "SLT Fiber".into()
    } else {
        "VLESS".into()
    }
}

pub fn format_protocol_label(transport: &str, tls_mode: &str, vcn: bool) -> String {
    let tr_lc = transport.trim().to_lowercase();
    let tr = match tr_lc.as_str() {
        "ws" => "WS".to_string(),
        "grpc" => "gRPC".to_string(),
        "httpupgrade" => "HTTPUpgrade".to_string(),
        "xhttp" | "splithttp" => "XHTTP".to_string(),
        "h2" | "http" => "H2".to_string(),
        "kcp" => "mKCP".to_string(),
        "quic" => "QUIC".to_string(),
        "" | "tcp" | "raw" => "TCP".to_string(),
        other => other.to_uppercase(),
    };
    match tls_mode.trim().to_lowercase().as_str() {
        "reality" => format!("{tr}+REALITY"),
        "tls" if vcn => format!("{tr}+TLS+VCN"),
        "tls" => format!("{tr}+TLS"),
        "" | "none" => tr,
        other => format!("{tr}+{}", other.to_uppercase()),
    }
}

pub fn parse_vless_uri(raw: &str) -> Result<ServerNode, String> {
    let trimmed = raw.trim();
    if !trimmed.to_lowercase().starts_with("vless://") {
        return Err("Not a vless:// URI".into());
    }
    let parsed = Url::parse(trimmed).map_err(|e| format!("Invalid VLESS URI: {e}"))?;
    let uuid = parsed.username().to_string();
    if uuid.is_empty() {
        return Err("VLESS URI missing UUID".into());
    }
    let address = parsed
        .host_str()
        .ok_or_else(|| "VLESS URI missing server address".to_string())?
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_string();
    let port = parsed.port().unwrap_or(443);

    let params: HashMap<String, String> = parsed
        .query_pairs()
        .map(|(k, v)| (k.to_lowercase(), v.to_string()))
        .collect();

    let name = parsed
        .fragment()
        .filter(|f| !f.is_empty())
        .map(urlencoding_decode)
        .unwrap_or_else(|| format!("{address}:{port}"));

    let raw_transport = params
        .get("type")
        .or_else(|| params.get("network"))
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "tcp".into());
    let transport = if raw_transport == "raw" {
        "tcp".to_string()
    } else {
        raw_transport
    };

    let raw_tls_mode = params
        .get("security")
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| if port == 443 { "tls".into() } else { "none".into() });
    let tls_mode = if raw_tls_mode == "xtls" {
        "tls".to_string()
    } else {
        raw_tls_mode
    };

    let sni = params
        .get("sni")
        .or_else(|| params.get("servername"))
        .cloned()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| address.clone());

    let vcn_param = params
        .get("vcn")
        .or_else(|| params.get("verifypeercertbyname"))
        .cloned()
        .filter(|v| !v.is_empty());
    let explicit_vcn = vcn_param.is_some();
    let vcn_host = vcn_param.filter(|v| v != "strict" && v != "1" && v != "true");

    let fingerprint = params
        .get("fp")
        .cloned()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "chrome".into());
    let alpn = params.get("alpn").cloned().filter(|s| !s.is_empty());
    let flow = params.get("flow").cloned().filter(|s| !s.is_empty());
    let public_key = params.get("pbk").cloned().filter(|s| !s.is_empty());
    let short_id = params.get("sid").cloned().filter(|s| !s.is_empty());
    let spider_x = params.get("spx").cloned().filter(|s| !s.is_empty());
    let path = params.get("path").cloned().filter(|s| !s.is_empty());
    let host = params.get("host").cloned().filter(|s| !s.is_empty());
    let service_name = params
        .get("servicename")
        .cloned()
        .filter(|s| !s.is_empty());
    let header_type = params
        .get("headertype")
        .cloned()
        .filter(|s| !s.is_empty());
    let mode = params.get("mode").cloned().filter(|s| !s.is_empty());
    let authority = params.get("authority").cloned().filter(|s| !s.is_empty());
    let extra = params.get("extra").cloned().filter(|s| !s.is_empty());
    let seed = params.get("seed").cloned().filter(|s| !s.is_empty());
    let encryption = params.get("encryption").cloned().filter(|s| !s.is_empty());
    let allow_insecure = params
        .get("allowinsecure")
        .or_else(|| params.get("insecure"))
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let pinned_cert_sha256 = params
        .get("pcs")
        .or_else(|| params.get("pinsha256"))
        .or_else(|| params.get("pinnedpeercertsha256"))
        .cloned()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let isp = infer_isp(&name, &sni);
    let region = infer_region(&name, &address);
    let protocol = format_protocol_label(&transport, &tls_mode, explicit_vcn);

    Ok(ServerNode {
        id: format!("node-{}", Uuid::new_v4().simple()),
        name,
        region,
        isp,
        address: address.clone(),
        port,
        uuid,
        sni,
        protocol,
        transport,
        tls_mode,
        vcn: explicit_vcn,
        vcn_host,
        fingerprint,
        alpn,
        flow,
        public_key,
        short_id,
        spider_x,
        path,
        host,
        service_name,
        header_type,
        mode,
        authority,
        extra,
        seed,
        encryption,
        allow_insecure,
        pinned_cert_sha256,
        ping: None,
        quota_used_gb: 0.0,
        quota_total_gb: 0.0,
        quota_up_bytes: 0,
        quota_down_bytes: 0,
        quota_total_bytes: 0,
        quota_expiry_ms: 0,
        quota_enabled: true,
        quota_email: String::new(),
        quota_updated_at_ms: 0,
        starred: false,
        online: false,
        ip: address,
        uri: trimmed.to_string(),
        raw_outbound: None,
    })
}

pub fn parse_vmess_uri(raw: &str) -> Result<ServerNode, String> {
    let trimmed = raw.trim();
    let payload = trimmed
        .strip_prefix("vmess://")
        .or_else(|| trimmed.strip_prefix("VMESS://"))
        .ok_or_else(|| "Not a vmess:// URI".to_string())?;
    let bytes = decode_b64_flexible(payload)?;
    let json_str = String::from_utf8(bytes).map_err(|_| "VMess payload is not valid UTF-8")?;
    let obj: Value =
        serde_json::from_str(&json_str).map_err(|e| format!("Invalid VMess JSON: {e}"))?;

    let address = obj["add"]
        .as_str()
        .ok_or_else(|| "VMess missing 'add' address".to_string())?
        .to_string();
    let port = match &obj["port"] {
        Value::Number(n) => n.as_u64().unwrap_or(443) as u16,
        Value::String(s) => s.parse::<u16>().unwrap_or(443),
        _ => 443,
    };
    let uuid = obj["id"]
        .as_str()
        .ok_or_else(|| "VMess missing 'id' UUID".to_string())?
        .to_string();
    let name = obj["ps"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("{address}:{port}"));

    let raw_transport = obj["net"]
        .as_str()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "tcp".to_string());
    let transport = if raw_transport == "raw" {
        "tcp".to_string()
    } else {
        raw_transport
    };
    let tls_raw = obj["tls"].as_str().unwrap_or("").trim();
    let tls_mode = if tls_raw.eq_ignore_ascii_case("tls") {
        "tls".to_string()
    } else {
        "none".to_string()
    };
    let sni = obj["sni"]
        .as_str()
        .or_else(|| obj["host"].as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(&address)
        .to_string();
    let host = obj["host"].as_str().filter(|s| !s.is_empty()).map(String::from);
    let path = obj["path"].as_str().filter(|s| !s.is_empty()).map(String::from);
    let alpn = obj["alpn"].as_str().filter(|s| !s.is_empty()).map(String::from);
    let header_type = obj["type"]
        .as_str()
        .filter(|s| !s.is_empty() && *s != "none")
        .map(String::from);
    let encryption = obj["scy"].as_str().filter(|s| !s.is_empty()).map(String::from);
    let fingerprint = obj["fp"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("chrome")
        .to_string();
    let vcn_host = obj["vcn"].as_str().filter(|s| !s.is_empty()).map(String::from);
    let vcn = vcn_host.is_some();
    let allow_insecure = obj["allowInsecure"]
        .as_bool()
        .or_else(|| obj["insecure"].as_bool())
        .or_else(|| {
            obj["allowInsecure"]
                .as_str()
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        })
        .unwrap_or(false);
    let pinned_cert_sha256 = obj["pcs"]
        .as_str()
        .or_else(|| obj["pinnedPeerCertSha256"].as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from);

    let isp = infer_isp(&name, &sni);
    let region = infer_region(&name, &address);
    let protocol = format!("VMess • {}", format_protocol_label(&transport, &tls_mode, vcn));

    Ok(ServerNode {
        id: format!("node-{}", Uuid::new_v4().simple()),
        name,
        region,
        isp,
        address: address.clone(),
        port,
        uuid,
        sni,
        protocol,
        transport,
        tls_mode,
        vcn,
        vcn_host,
        fingerprint,
        alpn,
        flow: None,
        public_key: None,
        short_id: None,
        spider_x: None,
        path,
        host,
        service_name: None,
        header_type,
        mode: None,
        authority: None,
        extra: None,
        seed: None,
        encryption,
        allow_insecure,
        pinned_cert_sha256,
        ping: None,
        quota_used_gb: 0.0,
        quota_total_gb: 0.0,
        quota_up_bytes: 0,
        quota_down_bytes: 0,
        quota_total_bytes: 0,
        quota_expiry_ms: 0,
        quota_enabled: true,
        quota_email: String::new(),
        quota_updated_at_ms: 0,
        starred: false,
        online: false,
        ip: address,
        uri: trimmed.to_string(),
        raw_outbound: None,
    })
}

pub fn parse_trojan_uri(raw: &str) -> Result<ServerNode, String> {
    let trimmed = raw.trim();
    if !trimmed.to_lowercase().starts_with("trojan://") {
        return Err("Not a trojan:// URI".into());
    }
    let parsed = Url::parse(trimmed).map_err(|e| format!("Invalid Trojan URI: {e}"))?;
    let password = urlencoding_decode(parsed.username());
    if password.is_empty() {
        return Err("Trojan URI missing password".into());
    }
    let address = parsed
        .host_str()
        .ok_or_else(|| "Trojan URI missing server address".to_string())?
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_string();
    let port = parsed.port().unwrap_or(443);

    let params: HashMap<String, String> = parsed
        .query_pairs()
        .map(|(k, v)| (k.to_lowercase(), v.to_string()))
        .collect();

    let name = parsed
        .fragment()
        .filter(|f| !f.is_empty())
        .map(urlencoding_decode)
        .unwrap_or_else(|| format!("{address}:{port}"));

    let raw_transport = params
        .get("type")
        .or_else(|| params.get("network"))
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "tcp".into());
    let transport = if raw_transport == "raw" {
        "tcp".to_string()
    } else {
        raw_transport
    };

    let tls_mode = params
        .get("security")
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "tls".into());

    let sni = params
        .get("sni")
        .or_else(|| params.get("servername"))
        .or_else(|| params.get("peer"))
        .cloned()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| address.clone());

    let vcn_param = params
        .get("vcn")
        .or_else(|| params.get("verifypeercertbyname"))
        .cloned()
        .filter(|v| !v.is_empty());
    let explicit_vcn = vcn_param.is_some();
    let vcn_host = vcn_param.filter(|v| v != "strict" && v != "1" && v != "true");

    let fingerprint = params
        .get("fp")
        .cloned()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "chrome".into());
    let alpn = params.get("alpn").cloned().filter(|s| !s.is_empty());
    let public_key = params.get("pbk").cloned().filter(|s| !s.is_empty());
    let short_id = params.get("sid").cloned().filter(|s| !s.is_empty());
    let spider_x = params.get("spx").cloned().filter(|s| !s.is_empty());
    let path = params.get("path").cloned().filter(|s| !s.is_empty());
    let host = params.get("host").cloned().filter(|s| !s.is_empty());
    let service_name = params.get("servicename").cloned().filter(|s| !s.is_empty());
    let header_type = params.get("headertype").cloned().filter(|s| !s.is_empty());
    let mode = params.get("mode").cloned().filter(|s| !s.is_empty());
    let authority = params.get("authority").cloned().filter(|s| !s.is_empty());
    let extra = params.get("extra").cloned().filter(|s| !s.is_empty());
    let seed = params.get("seed").cloned().filter(|s| !s.is_empty());
    let allow_insecure = params
        .get("allowinsecure")
        .or_else(|| params.get("insecure"))
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let pinned_cert_sha256 = params
        .get("pcs")
        .or_else(|| params.get("pinsha256"))
        .or_else(|| params.get("pinnedpeercertsha256"))
        .cloned()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let isp = infer_isp(&name, &sni);
    let region = infer_region(&name, &address);
    let protocol = format!("Trojan • {}", format_protocol_label(&transport, &tls_mode, explicit_vcn));

    Ok(ServerNode {
        id: format!("node-{}", Uuid::new_v4().simple()),
        name,
        region,
        isp,
        address: address.clone(),
        port,
        uuid: password,
        sni,
        protocol,
        transport,
        tls_mode,
        vcn: explicit_vcn,
        vcn_host,
        fingerprint,
        alpn,
        flow: None,
        public_key,
        short_id,
        spider_x,
        path,
        host,
        service_name,
        header_type,
        mode,
        authority,
        extra,
        seed,
        encryption: None,
        allow_insecure,
        pinned_cert_sha256,
        ping: None,
        quota_used_gb: 0.0,
        quota_total_gb: 0.0,
        quota_up_bytes: 0,
        quota_down_bytes: 0,
        quota_total_bytes: 0,
        quota_expiry_ms: 0,
        quota_enabled: true,
        quota_email: String::new(),
        quota_updated_at_ms: 0,
        starred: false,
        online: false,
        ip: address,
        uri: trimmed.to_string(),
        raw_outbound: None,
    })
}

pub fn parse_xray_json(raw: &str) -> Result<ServerNode, String> {
    let obj: Value =
        serde_json::from_str(raw.trim()).map_err(|e| format!("Invalid Xray JSON: {e}"))?;

    // Case 1: Full Xray config with outbounds[]
    let target_outbound = if let Some(outbounds) = obj.get("outbounds").and_then(|v| v.as_array()) {
        outbounds
            .iter()
            .find(|o| {
                matches!(
                    o.get("protocol").and_then(|p| p.as_str()),
                    Some("vless" | "vmess" | "trojan")
                )
            })
            .cloned()
            .unwrap_or_else(|| obj.clone())
    } else {
        obj.clone()
    };

    let name = target_outbound["tag"]
        .as_str()
        .or_else(|| obj["tag"].as_str())
        .filter(|s| !s.is_empty() && *s != "proxy")
        .unwrap_or("Imported Xray Node")
        .to_string();

    let stream = target_outbound
        .get("streamSettings")
        .or_else(|| obj.get("streamSettings"));
    let raw_transport = stream
        .and_then(|s| s["network"].as_str())
        .unwrap_or("tcp")
        .trim()
        .to_lowercase();
    let transport = if raw_transport == "raw" {
        "tcp".to_string()
    } else {
        raw_transport
    };
    let tls_mode = stream
        .and_then(|s| s["security"].as_str())
        .unwrap_or("tls")
        .trim()
        .to_lowercase();

    let vnext = target_outbound
        .get("settings")
        .and_then(|s| s.get("vnext"))
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first());

    let address = vnext
        .and_then(|v| v["address"].as_str())
        .or_else(|| target_outbound["address"].as_str())
        .or_else(|| obj["address"].as_str())
        .unwrap_or("edge.metrovpn.io")
        .to_string();
    let port = vnext
        .and_then(|v| v["port"].as_u64())
        .or_else(|| target_outbound["port"].as_u64())
        .unwrap_or(443) as u16;
    let user = vnext
        .and_then(|v| v.get("users"))
        .and_then(|u| u.as_array())
        .and_then(|arr| arr.first());
    let uuid = user
        .and_then(|u| u["id"].as_str())
        .or_else(|| obj["uuid"].as_str())
        .unwrap_or("")
        .to_string();
    let flow = user.and_then(|u| u["flow"].as_str()).map(String::from);

    let tls_settings = stream.and_then(|s| s.get("tlsSettings"));
    let reality_settings = stream.and_then(|s| s.get("realitySettings"));

    let sni = obj["sni"]
        .as_str()
        .or_else(|| tls_settings.and_then(|t| t["serverName"].as_str()))
        .or_else(|| reality_settings.and_then(|r| r["serverName"].as_str()))
        .unwrap_or(&address)
        .to_string();

    let vcn_host = tls_settings
        .and_then(|t| t["verifyPeerCertByName"].as_str())
        .map(String::from);
    let vcn = vcn_host.is_some()
        || stream.and_then(|s| s["vcn"].as_str()) == Some("strict");
    let pinned_cert_sha256 = tls_settings
        .and_then(|t| t["pinnedPeerCertSha256"].as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from);

    let isp = obj["isp"]
        .as_str()
        .map(String::from)
        .unwrap_or_else(|| infer_isp(&name, &sni));
    let region = infer_region(&name, &address);
    let protocol = format_protocol_label(&transport, &tls_mode, vcn);

    let uri = format!(
        "vless://{}@{}:{}?security={}&sni={}&type={}#{}",
        if uuid.is_empty() {
            "00000000-0000-0000-0000-000000000000"
        } else {
            &uuid
        },
        address,
        port,
        tls_mode,
        sni,
        transport,
        urlencoding_encode(&name)
    );

    Ok(ServerNode {
        id: format!("node-{}", Uuid::new_v4().simple()),
        name,
        region,
        isp,
        address: address.clone(),
        port,
        uuid,
        sni,
        protocol,
        transport,
        tls_mode,
        vcn,
        vcn_host,
        fingerprint: tls_settings
            .and_then(|t| t["fingerprint"].as_str())
            .unwrap_or("chrome")
            .to_string(),
        alpn: None,
        flow,
        public_key: reality_settings
            .and_then(|r| r["publicKey"].as_str())
            .map(String::from),
        short_id: reality_settings
            .and_then(|r| r["shortId"].as_str())
            .map(String::from),
        spider_x: reality_settings
            .and_then(|r| r["spiderX"].as_str())
            .map(String::from),
        path: stream
            .and_then(|s| s.get("wsSettings"))
            .and_then(|w| w["path"].as_str())
            .map(String::from),
        host: None,
        service_name: stream
            .and_then(|s| s.get("grpcSettings"))
            .and_then(|g| g["serviceName"].as_str())
            .map(String::from),
        header_type: None,
        mode: None,
        authority: None,
        extra: None,
        seed: None,
        encryption: None,
        allow_insecure: tls_settings
            .and_then(|t| t["allowInsecure"].as_bool())
            .unwrap_or(false),
        pinned_cert_sha256,
        ping: None,
        quota_used_gb: 0.0,
        quota_total_gb: 0.0,
        quota_up_bytes: 0,
        quota_down_bytes: 0,
        quota_total_bytes: 0,
        quota_expiry_ms: 0,
        quota_enabled: true,
        quota_email: String::new(),
        quota_updated_at_ms: 0,
        starred: false,
        online: false,
        ip: address,
        uri,
        raw_outbound: if target_outbound.get("protocol").is_some() {
            Some(target_outbound)
        } else {
            None
        },
    })
}

pub fn normalize_saved_node(node: &mut ServerNode) {
    let lower_uri = node.uri.trim().to_lowercase();
    let reparsed = if lower_uri.starts_with("vless://") {
        parse_vless_uri(&node.uri).ok()
    } else if lower_uri.starts_with("vmess://") {
        parse_vmess_uri(&node.uri).ok()
    } else if lower_uri.starts_with("trojan://") {
        parse_trojan_uri(&node.uri).ok()
    } else {
        None
    };

    if let Some(fresh) = reparsed {
        node.transport = fresh.transport;
        node.tls_mode = fresh.tls_mode;
        node.vcn = fresh.vcn;
        node.vcn_host = fresh.vcn_host;
        node.protocol = fresh.protocol;
        node.header_type = fresh.header_type;
        node.mode = fresh.mode;
        node.authority = fresh.authority;
        node.extra = fresh.extra;
        node.seed = fresh.seed;
        node.encryption = fresh.encryption;
        node.allow_insecure = fresh.allow_insecure;
        node.pinned_cert_sha256 = fresh.pinned_cert_sha256;
    } else {
        if node.transport.eq_ignore_ascii_case("raw") {
            node.transport = "tcp".to_string();
        } else {
            node.transport = node.transport.trim().to_lowercase();
        }
        node.tls_mode = node.tls_mode.trim().to_lowercase();
        if node.tls_mode == "reality" {
            node.vcn = false;
        }
        node.protocol = format_protocol_label(&node.transport, &node.tls_mode, node.vcn);
    }
}

pub fn parse_any(raw: &str, mode: Option<&str>) -> Result<Vec<ServerNode>, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Input is empty".into());
    }

    if mode == Some("json") || trimmed.starts_with('{') || trimmed.starts_with('[') {
        return Ok(vec![parse_xray_json(trimmed)?]);
    }

    let mut results = Vec::new();
    let candidate_text = if trimmed.contains("://") {
        trimmed.to_string()
    } else if let Ok(decoded) = decode_b64_flexible(trimmed) {
        String::from_utf8(decoded).unwrap_or_else(|_| trimmed.to_string())
    } else {
        trimmed.to_string()
    };

    for line in candidate_text.lines() {
        let l = line.trim();
        if l.is_empty() {
            continue;
        }
        let lower = l.to_lowercase();
        if lower.starts_with("vless://") {
            if let Ok(node) = parse_vless_uri(l) {
                results.push(node);
            }
        } else if lower.starts_with("vmess://") {
            if let Ok(node) = parse_vmess_uri(l) {
                results.push(node);
            }
        } else if lower.starts_with("trojan://") {
            if let Ok(node) = parse_trojan_uri(l) {
                results.push(node);
            }
        }
    }

    if results.is_empty() {
        Err("No valid vless://, vmess://, trojan://, or Xray JSON profiles found".into())
    } else {
        Ok(results)
    }
}

fn percent_encode_fragment(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for b in input.bytes() {
        let is_unreserved = b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~');
        if is_unreserved {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// Keeps `node.uri` synchronized when a user edits display name or SNI so
/// Share QR and Copy URI always export the updated configuration.
pub fn update_node_uri_fields(node: &mut ServerNode) {
    let trimmed = node.uri.trim().to_string();
    let lower = trimmed.to_lowercase();

    if lower.starts_with("vless://") || lower.starts_with("trojan://") {
        if let Ok(mut parsed) = Url::parse(&trimmed) {
            let clean_sni = node.sni.trim();
            let mut pairs: Vec<(String, String)> = parsed
                .query_pairs()
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect();
            if !clean_sni.is_empty() {
                let mut replaced = false;
                for (k, v) in &mut pairs {
                    if k.eq_ignore_ascii_case("sni") || k.eq_ignore_ascii_case("servername") {
                        *v = clean_sni.to_string();
                        replaced = true;
                    }
                }
                if !replaced {
                    pairs.push(("sni".to_string(), clean_sni.to_string()));
                }
            }
            {
                let mut qp = parsed.query_pairs_mut();
                qp.clear();
                for (k, v) in &pairs {
                    qp.append_pair(k, v);
                }
            }
            let encoded_name = percent_encode_fragment(node.name.trim());
            parsed.set_fragment(if encoded_name.is_empty() {
                None
            } else {
                Some(&encoded_name)
            });
            node.uri = parsed.to_string();
            return;
        }
    } else if lower.starts_with("vmess://") {
        if let Some(b64) = trimmed
            .strip_prefix("vmess://")
            .or_else(|| trimmed.strip_prefix("VMESS://"))
            .or_else(|| trimmed.get(8..))
        {
            if let Ok(raw_bytes) = decode_b64_flexible(b64) {
                if let Ok(mut json) = serde_json::from_slice::<Value>(&raw_bytes) {
                    if let Some(obj) = json.as_object_mut() {
                        obj.insert("ps".to_string(), Value::String(node.name.trim().to_string()));
                        if !node.sni.trim().is_empty() {
                            obj.insert(
                                "sni".to_string(),
                                Value::String(node.sni.trim().to_string()),
                            );
                        }
                    }
                    if let Ok(serialized) = serde_json::to_string(&json) {
                        node.uri = format!("vmess://{}", STANDARD.encode(serialized.as_bytes()));
                        return;
                    }
                }
            }
        }
    }

    // Fallback: build canonical vless:// URI if node.uri was blank
    if trimmed.is_empty() && !node.address.trim().is_empty() {
        let host_part = if node.address.contains(':') && !node.address.starts_with('[') {
            format!("[{}]", node.address.trim())
        } else {
            node.address.trim().to_string()
        };
        let encoded_name = percent_encode_fragment(node.name.trim());
        node.uri = format!(
            "vless://{}@{}:{}?security={}&sni={}&type={}#{}",
            node.uuid.trim(),
            host_part,
            node.port,
            node.tls_mode.trim(),
            urlencoding_encode(node.sni.trim()),
            node.transport.trim(),
            encoded_name
        );
    }
}

pub async fn fetch_subscription(
    url: &str,
    proxy_http_port: Option<u16>,
) -> Result<(Vec<ServerNode>, Option<(f64, f64)>), String> {
    let clean_url = url.trim();
    let user_agent = format!(
        "Metrovpn/{} (Windows NT 10.0; Win64; x64)",
        env!("CARGO_PKG_VERSION")
    );
    let attempts: Vec<Option<u16>> = match proxy_http_port {
        Some(p) => vec![Some(p), None],
        None => vec![None],
    };

    let mut last_err = String::from("Subscription request failed");
    let mut response_opt = None;

    for port_opt in attempts {
        let mut builder = reqwest::Client::builder().timeout(std::time::Duration::from_secs(15));
        if let Some(p) = port_opt {
            if let Ok(px) = reqwest::Proxy::all(format!("http://127.0.0.1:{p}")) {
                builder = builder.proxy(px);
            }
        } else {
            builder = builder.no_proxy();
        }
        let client = match builder.build() {
            Ok(c) => c,
            Err(e) => {
                last_err = format!("Failed to build HTTP client: {e}");
                continue;
            }
        };
        match client
            .get(clean_url)
            .header("User-Agent", &user_agent)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                response_opt = Some(resp);
                break;
            }
            Ok(resp) => {
                last_err = format!("Subscription server returned HTTP {}", resp.status());
            }
            Err(e) => {
                last_err = format!("Subscription request failed: {e}");
            }
        }
    }

    let resp = response_opt.ok_or(last_err)?;

    let quota = resp
        .headers()
        .get("subscription-userinfo")
        .and_then(|v| v.to_str().ok())
        .and_then(parse_subscription_userinfo);

    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read subscription body: {e}"))?;

    let mut nodes = parse_any(&body, None)?;
    if let Some((used_gb, total_gb)) = quota {
        for n in &mut nodes {
            n.quota_used_gb = used_gb;
            n.quota_total_gb = total_gb;
        }
    }
    Ok((nodes, quota))
}

fn parse_subscription_userinfo(header: &str) -> Option<(f64, f64)> {
    let mut upload: u64 = 0;
    let mut download: u64 = 0;
    let mut total: u64 = 0;
    for part in header.split(';') {
        let mut kv = part.trim().splitn(2, '=');
        let k = kv.next()?.trim().to_lowercase();
        let v = kv.next()?.trim().parse::<u64>().ok()?;
        match k.as_str() {
            "upload" => upload = v,
            "download" => download = v,
            "total" => total = v,
            _ => {}
        }
    }
    if total == 0 {
        return None;
    }
    let gb = 1024.0 * 1024.0 * 1024.0;
    Some((
        ((upload + download) as f64 / gb * 10.0).round() / 10.0,
        (total as f64 / gb * 10.0).round() / 10.0,
    ))
}

pub fn decode_qr_from_bytes(bytes: &[u8]) -> Result<String, String> {
    let img = image::load_from_memory(bytes)
        .map_err(|e| format!("Could not decode image: {e}"))?
        .to_luma8();
    let mut prepared = rqrr::PreparedImage::prepare(img);
    let grids = prepared.detect_grids();
    for grid in grids {
        if let Ok((_meta, content)) = grid.decode() {
            return Ok(content);
        }
    }
    Err("No QR code detected in the provided image".into())
}

fn try_decode_luma_grid(luma: &image::GrayImage) -> Option<String> {
    let mut prepared = rqrr::PreparedImage::prepare(luma.clone());
    for grid in prepared.detect_grids() {
        if let Ok((_meta, content)) = grid.decode() {
            return Some(content);
        }
    }
    let mut inverted = luma.clone();
    for p in inverted.pixels_mut() {
        p.0[0] = 255u8.saturating_sub(p.0[0]);
    }
    let mut prep_inv = rqrr::PreparedImage::prepare(inverted);
    for grid in prep_inv.detect_grids() {
        if let Ok((_meta, content)) = grid.decode() {
            return Some(content);
        }
    }
    None
}

pub fn decode_qr_from_rgba(width: u32, height: u32, rgba: Vec<u8>) -> Result<String, String> {
    let img = image::RgbaImage::from_raw(width, height, rgba)
        .ok_or_else(|| "Invalid screen image buffer".to_string())?;
    let luma = image::DynamicImage::ImageRgba8(img).to_luma8();

    if let Some(hit) = try_decode_luma_grid(&luma) {
        return Ok(hit);
    }

    // Upscale clipped/small QR regions 2x so rqrr finder patterns lock cleanly
    if width < 900 || height < 900 {
        let up_w = (width.saturating_mul(2)).clamp(120, 2000);
        let up_h = (height.saturating_mul(2)).clamp(120, 2000);
        let upscaled =
            image::imageops::resize(&luma, up_w, up_h, image::imageops::FilterType::Triangle);
        if let Some(hit) = try_decode_luma_grid(&upscaled) {
            return Ok(hit);
        }
    }

    // High-contrast binarized fallback for dimmed/low-contrast screens
    let mut contrast = luma;
    for p in contrast.pixels_mut() {
        p.0[0] = if p.0[0] > 128 { 255 } else { 0 };
    }
    if let Some(hit) = try_decode_luma_grid(&contrast) {
        return Ok(hit);
    }

    Err("No QR code found in the selected region. Draw the box slightly around the whole QR code and try again.".into())
}

fn urlencoding_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let h1 = bytes[i + 1];
            let h2 = bytes[i + 2];
            if let (Some(a), Some(b)) = (hex_val(h1), hex_val(h2)) {
                out.push((a << 4) | b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| input.to_string())
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn urlencoding_encode(input: &str) -> String {
    url::form_urlencoded::byte_serialize(input.as_bytes()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_vless_vcn() {
        let uri = "vless://a94b7c12-e3f1-48a2-b910-81c450d912fa@sg01.metrovpn.io:443?encryption=none&security=tls&sni=st1.zoom.us&vcn=vpn.metrodens.site&fp=chrome&type=tcp&flow=xtls-rprx-vision#SG-01%20SLT";
        let node = parse_vless_uri(uri).expect("should parse vless");
        assert_eq!(node.address, "sg01.metrovpn.io");
        assert_eq!(node.port, 443);
        assert_eq!(node.sni, "st1.zoom.us");
        assert!(node.vcn);
        assert_eq!(node.protocol, "TCP+TLS+VCN");
        assert_eq!(node.vcn_host.as_deref(), Some("vpn.metrodens.site"));
        assert_eq!(node.flow.as_deref(), Some("xtls-rprx-vision"));
        assert_eq!(node.name, "SG-01 SLT");
    }

    #[test]
    fn test_parse_vless_slt_zoom_without_vcn_param() {
        let uri = "vless://7f3bd91d-9110-45ac-aec9-304c74e49e83@vpn.metrodens.site:443?encryption=none&type=tcp&headerType=none&security=tls&fp=chrome&sni=st1.zoom.us&alpn=h2%2Chttp%2F1.1#SLT%20Fiber%20-%20Zoom%20Meet%20Max%20%2F%20Lite-SLT-FIBER-ZOOM-VIP-%40METRODENZ-122";
        let node = parse_vless_uri(uri).expect("should parse SLT Zoom link");
        assert_eq!(node.address, "vpn.metrodens.site");
        assert_eq!(node.port, 443);
        assert_eq!(node.sni, "st1.zoom.us");
        assert_eq!(node.transport, "tcp");
        assert_eq!(node.tls_mode, "tls");
        assert_eq!(node.protocol, "TCP+TLS");
        assert_eq!(node.alpn.as_deref(), Some("h2,http/1.1"));
        assert!(!node.vcn);
        assert_eq!(node.vcn_host, None);
        assert_eq!(
            node.name,
            "SLT Fiber - Zoom Meet Max / Lite-SLT-FIBER-ZOOM-VIP-@METRODENZ-122"
        );
    }

    #[test]
    fn test_parse_vless_reality() {
        let uri = "vless://7c2e19a0-5b44-41d8-9a77-62f109e3ab11@sg02.metrovpn.io:443?security=reality&sni=m.zoom.us&pbk=abc123&sid=01ef&type=tcp#RealityNode";
        let node = parse_vless_uri(uri).expect("should parse reality");
        assert_eq!(node.tls_mode, "reality");
        assert_eq!(node.protocol, "TCP+REALITY");
        assert!(!node.vcn);
        assert_eq!(node.public_key.as_deref(), Some("abc123"));
        assert_eq!(node.short_id.as_deref(), Some("01ef"));
    }

    #[test]
    fn test_parse_vmess() {
        let payload = serde_json::json!({
            "v": "2",
            "ps": "JP-01 VMess",
            "add": "jp.metrovpn.io",
            "port": 443,
            "id": "3b1f09a4-12c8-4e7b-b3d1-90a27c8e51fd",
            "net": "ws",
            "host": "cdn.example.com",
            "path": "/ws",
            "tls": "tls",
            "sni": "cdn.example.com"
        });
        let b64 = STANDARD.encode(payload.to_string().as_bytes());
        let node = parse_vmess_uri(&format!("vmess://{b64}")).expect("should parse vmess");
        assert_eq!(node.name, "JP-01 VMess");
        assert_eq!(node.transport, "ws");
        assert_eq!(node.tls_mode, "tls");
        assert_eq!(node.path.as_deref(), Some("/ws"));
    }

    #[test]
    fn test_parse_xray_json_profile() {
        let raw = r#"{
            "tag": "HK-02 Express",
            "isp": "Dialog",
            "address": "hk02.metrovpn.io",
            "port": 443,
            "uuid": "7c2e19a0-5b44-41d8-9a77-62f109e3ab11",
            "sni": "cdn.zoom.us",
            "streamSettings": { "network": "ws", "security": "tls", "vcn": "strict" }
        }"#;
        let node = parse_xray_json(raw).expect("should parse json");
        assert_eq!(node.name, "HK-02 Express");
        assert_eq!(node.isp, "Dialog");
        assert!(node.vcn);
    }

    #[test]
    fn test_update_node_uri_fields_vless_and_vmess() {
        let uri = "vless://a94b7c12-e3f1-48a2-b910-81c450d912fa@vpn.metrodens.site:443?encryption=none&security=tls&sni=st1.zoom.us&vcn=vpn.metrodens.site&type=tcp#Old%20Name";
        let mut node = parse_vless_uri(uri).expect("should parse vless");
        node.name = "New SLT Fiber".into();
        node.sni = "m.zoom.us".into();
        update_node_uri_fields(&mut node);

        let reparsed = parse_vless_uri(&node.uri).expect("updated vless should re-parse");
        assert_eq!(reparsed.name, "New SLT Fiber");
        assert_eq!(reparsed.sni, "m.zoom.us");
        assert_eq!(reparsed.vcn_host.as_deref(), Some("vpn.metrodens.site"));

        let payload = serde_json::json!({
            "v": "2", "ps": "Old VMess", "add": "jp.metrovpn.io", "port": 443,
            "id": "3b1f09a4-12c8-4e7b-b3d1-90a27c8e51fd", "net": "ws",
            "host": "cdn.example.com", "path": "/ws", "tls": "tls", "sni": "old.zoom.us"
        });
        let mut vnode = parse_vmess_uri(&format!(
            "vmess://{}",
            STANDARD.encode(payload.to_string().as_bytes())
        ))
        .expect("should parse vmess");
        vnode.name = "Edited VMess".into();
        vnode.sni = "new.zoom.us".into();
        update_node_uri_fields(&mut vnode);

        let vreparsed = parse_vmess_uri(&vnode.uri).expect("updated vmess should re-parse");
        assert_eq!(vreparsed.name, "Edited VMess");
        assert_eq!(vreparsed.sni, "new.zoom.us");
    }
}
