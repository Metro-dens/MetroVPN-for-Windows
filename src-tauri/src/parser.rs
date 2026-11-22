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

fn format_protocol_label(transport: &str, tls_mode: &str, vcn: bool) -> String {
    let tr = match transport.to_lowercase().as_str() {
        "ws" => "WS",
        "grpc" => "gRPC",
        "httpupgrade" => "HTTPUpgrade",
        "xhttp" => "XHTTP",
        _ => "TCP",
    };
    match tls_mode.to_lowercase().as_str() {
        "reality" => format!("{tr} • Reality"),
        "tls" if vcn => format!("{tr} • TLS+VCN"),
        "tls" => format!("{tr} • TLS 1.3"),
        _ => format!("{tr} • Plain"),
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
        .to_string();
    let port = parsed.port().unwrap_or(443);

    let params: HashMap<String, String> = parsed
        .query_pairs()
        .map(|(k, v)| (k.to_lowercase(), v.to_string()))
        .collect();

    let name = parsed
        .fragment()
        .filter(|f| !f.is_empty())
        .map(|f| urlencoding_decode(f))
        .unwrap_or_else(|| format!("{address}:{port}"));

    let transport = params
        .get("type")
        .or_else(|| params.get("network"))
        .cloned()
        .unwrap_or_else(|| "tcp".into());
    let tls_mode = params
        .get("security")
        .cloned()
        .unwrap_or_else(|| if port == 443 { "tls".into() } else { "none".into() });

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
    let explicit_allow_insecure = params
        .get("allowinsecure")
        .or_else(|| params.get("insecure"))
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let implicit_vcn_host = if vcn_param.is_none()
        && tls_mode.eq_ignore_ascii_case("tls")
        && !explicit_allow_insecure
        && address.parse::<std::net::IpAddr>().is_err()
        && !address.eq_ignore_ascii_case(&sni)
    {
        Some(address.clone())
    } else {
        None
    };
    let vcn = vcn_param.is_some() || implicit_vcn_host.is_some() || tls_mode == "reality";
    let vcn_host = vcn_param
        .filter(|v| v != "strict" && v != "1" && v != "true")
        .or(implicit_vcn_host);

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
    let allow_insecure = params
        .get("allowinsecure")
        .or_else(|| params.get("insecure"))
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let isp = infer_isp(&name, &sni);
    let region = infer_region(&name, &address);
    let protocol = format_protocol_label(&transport, &tls_mode, vcn);

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
        flow,
        public_key,
        short_id,
        spider_x,
        path,
        host,
        service_name,
        allow_insecure,
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

    let transport = obj["net"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("tcp")
        .to_string();
    let tls_raw = obj["tls"].as_str().unwrap_or("");
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
    let fingerprint = obj["fp"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("chrome")
        .to_string();
    let vcn_host = obj["vcn"].as_str().filter(|s| !s.is_empty()).map(String::from);
    let vcn = vcn_host.is_some();

    let isp = infer_isp(&name, &sni);
    let region = infer_region(&name, &address);
    let protocol = format_protocol_label(&transport, &tls_mode, vcn);

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
        allow_insecure: false,
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
    let transport = stream
        .and_then(|s| s["network"].as_str())
        .unwrap_or("tcp")
        .to_string();
    let tls_mode = stream
        .and_then(|s| s["security"].as_str())
        .unwrap_or("tls")
        .to_string();

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
        || stream.and_then(|s| s["vcn"].as_str()) == Some("strict")
        || tls_mode == "reality";

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
        allow_insecure: tls_settings
            .and_then(|t| t["allowInsecure"].as_bool())
            .unwrap_or(false),
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
        }
    }

    if results.is_empty() {
        Err("No valid vless://, vmess://, or Xray JSON profiles found".into())
    } else {
        Ok(results)
    }
}

pub async fn fetch_subscription(url: &str) -> Result<(Vec<ServerNode>, Option<(f64, f64)>), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let resp = client
        .get(url.trim())
        .header("User-Agent", "Metrovpn/2.4 (Windows NT 10.0; Win64; x64)")
        .send()
        .await
        .map_err(|e| format!("Subscription request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Subscription server returned HTTP {}", resp.status()));
    }

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
        assert_eq!(node.alpn.as_deref(), Some("h2,http/1.1"));
        assert!(node.vcn);
        assert_eq!(node.vcn_host.as_deref(), Some("vpn.metrodens.site"));
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
}

