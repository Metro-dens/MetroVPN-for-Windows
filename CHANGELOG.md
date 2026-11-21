# Changelog

## [v2.4.0] - 2026-11-21

### Added
- **Desktop Client UI (React + Vite + Tailwind CSS v4 + Framer Motion):**
  - Crimson Void Material 3 Expressive frameless desktop shell (`1040×680`) with custom titlebar, 12-lobe scalloped crimson connect orb, live speed sparklines, quota bar, and `320×420` borderless System Tray flyout.
  - Branded MetroVPN wordmark, wolf APK icon for app/installer/tray icons, and ISP filter tabs/badges (`SLT`, `Dialog`, `Hutch`, `Airtel`, `Mobitel`).
- **Xray-core `v26.11.9` Engine & URI Importer (`src-tauri`):**
  - Supports `vless://` (`tls`, `vcn` / `verifyPeerCertByName`, `reality`, `ws`, `grpc`, `tcp`, uTLS fingerprints, `xtls-rprx-vision`), `vmess://` (base64 JSON), raw Xray `.json` configs, subscription URL syncing, and QR code image decoding.
  - Tunneling profiles: `Strict VCN`, `TLS Frag` (`dialerProxy` ClientHello fragmentation), and `Standard`, plus DoH resolvers (`1.1.1.1`, `8.8.8.8`, `9.9.9.9`, or custom DoH) and LAN Proxy Sharing (`0.0.0.0:10808` / `:10809`).
- **Windows 11 Routing (`network_win.rs`):**
  - **System Proxy Mode (No Admin):** Configures `HKCU\...\Internet Settings` with `InternetSetOptionW` instant refresh, pre-VPN backup/restore, and crash/stale-lock auto-recovery on launch.
  - **TUN Mode (Full System via Wintun + `tun2socks v2.7.0`):** Creates `Metrovpn-TUN` virtual adapter with configurable MTU (`1500` / `1420` / `1280`), UAC `"Restart as Administrator"` prompt, and Split Tunneling `.exe` exclusions.
- **Diagnostics & Tray:**
  - Concurrent node latency testing (`ping.rs`), 3-phase Cloudflare speed test (`speedtest.rs`) routed over Xray SOCKS5 with persistent history, live Xray logs drawer, and dynamic Windows System Tray icon + flyout.
- **Windows Release Packaging:**
  - NSIS `.exe` installer, WiX `.msi` installer, single-file standalone `Metrovpn-standalone-x64.exe`, portable `.zip`, and `SHA256SUMS.txt`.
