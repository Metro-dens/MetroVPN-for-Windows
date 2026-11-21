use bytes::Bytes;
use http::{Method, Request};
use std::time::Duration;
use tokio::net::TcpStream;

#[derive(Debug, Default, Clone, Copy)]
pub struct XrayTrafficTotals {
    pub uplink_bytes: u64,
    pub downlink_bytes: u64,
}

/// Queries Xray-core's gRPC `StatsService/QueryStats` over HTTP/2 (`127.0.0.1:10085`)
/// without spawning any external process.
pub async fn query_xray_stats(port: u16) -> Result<XrayTrafficTotals, String> {
    let addr = format!("127.0.0.1:{port}");
    let tcp = tokio::time::timeout(Duration::from_millis(800), TcpStream::connect(&addr))
        .await
        .map_err(|_| "Stats API connect timeout".to_string())?
        .map_err(|e| format!("Stats API connect failed: {e}"))?;

    let (mut client, h2_conn) = h2::client::handshake(tcp)
        .await
        .map_err(|e| format!("H2 handshake failed: {e}"))?;

    tokio::spawn(async move {
        let _ = h2_conn.await;
    });

    let req = Request::builder()
        .method(Method::POST)
        .uri(format!(
            "http://127.0.0.1:{port}/xray.app.stats.command.StatsService/QueryStats"
        ))
        .header("content-type", "application/grpc")
        .header("te", "trailers")
        .body(())
        .map_err(|e| format!("Build gRPC request failed: {e}"))?;

    let (response_fut, mut send_stream) = client
        .send_request(req, false)
        .map_err(|e| format!("Send gRPC request failed: {e}"))?;

    // Empty QueryStatsRequest protobuf framed for gRPC: [compressed=0, len=0]
    send_stream
        .send_data(Bytes::from_static(&[0, 0, 0, 0, 0]), true)
        .map_err(|e| format!("Send gRPC frame failed: {e}"))?;

    let resp = tokio::time::timeout(Duration::from_millis(1200), response_fut)
        .await
        .map_err(|_| "Stats API response timeout".to_string())?
        .map_err(|e| format!("Stats API response failed: {e}"))?;

    let mut body = resp.into_body();
    let mut raw = Vec::new();
    while let Some(chunk) = body.data().await {
        let chunk = chunk.map_err(|e| format!("Stats body chunk failed: {e}"))?;
        raw.extend_from_slice(&chunk);
        let _ = body.flow_control().release_capacity(chunk.len());
    }

    if raw.len() < 5 {
        return Ok(XrayTrafficTotals::default());
    }

    // Strip 5-byte gRPC frame header if present
    let msg = &raw[5..];
    Ok(parse_query_stats_response(msg))
}

fn parse_query_stats_response(data: &[u8]) -> XrayTrafficTotals {
    let mut totals = XrayTrafficTotals::default();
    let mut i = 0;

    while i < data.len() {
        let Some((tag, next_i)) = read_varint(data, i) else {
            break;
        };
        i = next_i;
        let field_num = tag >> 3;
        let wire_type = tag & 0x07;

        if field_num == 1 && wire_type == 2 {
            let Some((len, start)) = read_varint(data, i) else {
                break;
            };
            let end = start.saturating_add(len as usize).min(data.len());
            if let Some((name, val)) = parse_stat_msg(&data[start..end]) {
                // Prefer outbound>>>proxy>>>traffic>>>{uplink,downlink}
                if name == "outbound>>>proxy>>>traffic>>>uplink" {
                    totals.uplink_bytes = val.max(0) as u64;
                } else if name == "outbound>>>proxy>>>traffic>>>downlink" {
                    totals.downlink_bytes = val.max(0) as u64;
                }
            }
            i = end;
        } else {
            i = skip_field(data, i, wire_type);
        }
    }

    totals
}

fn parse_stat_msg(data: &[u8]) -> Option<(String, i64)> {
    let mut i = 0;
    let mut name = String::new();
    let mut value: i64 = 0;

    while i < data.len() {
        let (tag, next_i) = read_varint(data, i)?;
        i = next_i;
        let field_num = tag >> 3;
        let wire_type = tag & 0x07;
        match (field_num, wire_type) {
            (1, 2) => {
                let (len, start) = read_varint(data, i)?;
                let end = start.saturating_add(len as usize).min(data.len());
                name = String::from_utf8_lossy(&data[start..end]).to_string();
                i = end;
            }
            (2, 0) => {
                let (v, next) = read_varint(data, i)?;
                value = v as i64;
                i = next;
            }
            _ => {
                i = skip_field(data, i, wire_type);
            }
        }
    }
    Some((name, value))
}

fn read_varint(data: &[u8], mut idx: usize) -> Option<(u64, usize)> {
    let mut result: u64 = 0;
    let mut shift = 0;
    while idx < data.len() && shift < 64 {
        let byte = data[idx];
        idx += 1;
        result |= ((byte & 0x7f) as u64) << shift;
        if byte & 0x80 == 0 {
            return Some((result, idx));
        }
        shift += 7;
    }
    None
}

fn skip_field(data: &[u8], idx: usize, wire_type: u64) -> usize {
    match wire_type {
        0 => read_varint(data, idx).map(|(_, n)| n).unwrap_or(data.len()),
        1 => (idx + 8).min(data.len()),
        2 => read_varint(data, idx)
            .map(|(len, start)| start.saturating_add(len as usize).min(data.len()))
            .unwrap_or(data.len()),
        5 => (idx + 4).min(data.len()),
        _ => data.len(),
    }
}
