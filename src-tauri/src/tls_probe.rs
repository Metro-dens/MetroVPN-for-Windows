use crate::models::{AppSettings, ServerNode};
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, Error as RustlsError, SignatureScheme};
use sha2::{Digest, Sha256};
use std::net::IpAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;

#[derive(Debug)]
struct CaptureLeafCertVerifier {
    leaf_der: Arc<Mutex<Option<Vec<u8>>>>,
}

impl ServerCertVerifier for CaptureLeafCertVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, RustlsError> {
        if let Ok(mut guard) = self.leaf_der.lock() {
            *guard = Some(end_entity.as_ref().to_vec());
        }
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

/// Connects to `(dial_host, port)` over TLS sending `sni` in the ClientHello,
/// captures the server's leaf X.509 certificate DER bytes, and returns its
/// lowercase SHA-256 hex digest formatted for Xray-core v26.x `pinnedPeerCertSha256`.
pub async fn probe_tls_leaf_sha256(
    dial_host: &str,
    port: u16,
    sni: &str,
) -> Result<String, String> {
    let dial_clean = dial_host.trim();
    if dial_clean.is_empty() {
        return Err("Empty dial host for TLS certificate probe".into());
    }
    let sni_clean = if sni.trim().is_empty() {
        dial_clean
    } else {
        sni.trim()
    };

    let server_name = ServerName::try_from(sni_clean.to_string())
        .or_else(|_| ServerName::try_from(dial_clean.to_string()))
        .map_err(|_| format!("Invalid TLS SNI/host '{sni_clean}'"))?;

    let captured: Arc<Mutex<Option<Vec<u8>>>> = Arc::new(Mutex::new(None));
    let verifier = Arc::new(CaptureLeafCertVerifier {
        leaf_der: captured.clone(),
    });

    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let mut cfg = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| format!("Failed to initialize TLS probe config: {e}"))?
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();
    cfg.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];

    let target = format_host_port(dial_clean, port);
    let tcp = tokio::time::timeout(Duration::from_millis(3500), TcpStream::connect(&target))
        .await
        .map_err(|_| format!("TLS probe timed out connecting to {target}"))?
        .map_err(|e| format!("TLS probe TCP connect failed ({target}): {e}"))?;

    let connector = TlsConnector::from(Arc::new(cfg));
    let _ = tokio::time::timeout(
        Duration::from_millis(3500),
        connector.connect(server_name, tcp),
    )
    .await;

    let der = captured
        .lock()
        .ok()
        .and_then(|mut g| g.take())
        .ok_or_else(|| format!("Server {target} did not present a TLS certificate"))?;

    let digest = Sha256::digest(&der);
    let mut hex = String::with_capacity(64);
    for b in digest {
        use std::fmt::Write as _;
        let _ = write!(&mut hex, "{b:02x}");
    }
    Ok(hex)
}

fn format_host_port(host: &str, port: u16) -> String {
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    if bare.contains(':') {
        format!("[{bare}]:{port}")
    } else {
        format!("{bare}:{port}")
    }
}

/// Returns true when the node needs a runtime leaf-certificate SHA-256 pin
/// (`pinnedPeerCertSha256`) so Xray-core v26.11.9 can connect without the removed
/// `"allowInsecure": true` directive.
pub fn node_needs_auto_cert_pin(node: &ServerNode, settings: &AppSettings) -> bool {
    let sec = node.tls_mode.trim().to_lowercase();
    let is_tls = sec.is_empty() || sec == "tls" || sec == "xtls";
    if !is_tls {
        return false;
    }
    if node
        .pinned_cert_sha256
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some()
    {
        return false;
    }
    if node.allow_insecure || settings.allow_insecure_fallback || !settings.cert_pinning {
        return true;
    }
    // IP-based TLS server with no explicit VCN and no domain Host header cannot pass
    // hostname verification when SNI is spoofed or an IP literal.
    let addr_is_ip = node.address.trim().parse::<IpAddr>().is_ok();
    let has_vcn = node
        .vcn_host
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some();
    let has_domain_host = node
        .host
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && s.parse::<IpAddr>().is_err())
        .is_some();
    addr_is_ip && !has_vcn && !has_domain_host
}

/// Probes and returns a runtime `pinnedPeerCertSha256` hex string when required
/// for Xray-core v26.11.9 TLS compatibility.
pub async fn resolve_cert_pin_for_node(
    node: &ServerNode,
    settings: &AppSettings,
    dial_ip_override: Option<&str>,
) -> Option<String> {
    if !node_needs_auto_cert_pin(node, settings) {
        return None;
    }
    let dial_target = dial_ip_override
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(node.address.as_str());
    let effective_sni = if node.sni.trim().is_empty() {
        node.address.as_str()
    } else {
        node.sni.trim()
    };
    probe_tls_leaf_sha256(dial_target, node.port, effective_sni)
        .await
        .ok()
}
