# MetroVPN for Windows

Native Windows 11 desktop client for **Metro Dens**, built with **React + Vite + Tailwind CSS + Framer Motion + Tauri v2 (Rust) + Xray-core (`v26.11.9`) + Wintun (`tun2socks`)**.

## Features

- **Crimson Void Material 3 Expressive Desktop UI:** Frameless Windows 11 shell (`1040×680`), 12-lobe scalloped crimson connect orb, live download/upload throughput sparklines, wavy quota bars, and a `320×420` borderless System Tray flyout.
- **Xray-core Sidecar + Stats API:** Supports `vless://` (TLS, `vcn` `verifyPeerCertByName`, Reality, WS, gRPC, TCP, uTLS `chrome` fingerprint, `xtls-rprx-vision`), `vmess://`, raw `.json` profiles, subscription URL syncing, and QR image decoding.
- **Dual Windows Routing Modes:**
  - **System Proxy Mode (No Admin Required):** Configures `HKCU\...\Internet Settings` with `InternetSetOptionW` instant refresh, pre-VPN backup/restore, and automatic crash recovery on startup.
  - **TUN Mode (Full System via Wintun):** Routes all Windows TCP/UDP traffic through `Metrovpn-TUN` via `tun2socks`, with UAC elevation prompt (`Restart as Administrator`), custom MTU (`1500`/`1420`/`1280`), and Split Tunneling `.exe` exclusions.
- **Tunneling Profiles:** `Strict VCN`, `TLS Frag` (`dialerProxy` ClientHello fragmentation), and `Standard`, plus DoH resolvers (`Cloudflare 1.1.1.1`, `Google 8.8.8.8`, `Quad9 9.9.9.9`, or custom DoH) and LAN Proxy Sharing (`0.0.0.0:10808` / `:10809`).
- **Concurrent Ping & Cloudflare Speed Test:** Async `tokio::task::JoinSet` TCP/TLS handshake ping across all nodes and a 3-phase Cloudflare speed benchmark routed over Xray SOCKS5 with persistent history.

## Build (Windows or Linux Cross-Compile)

### Fetch Sidecars & Resources
```powershell
.\scripts\fetch-core.ps1
```

### Build Frontend & Release Binary
```bash
npm install
npm run build
cd src-tauri
cargo build --release --target x86_64-pc-windows-msvc
```

Or package full NSIS (`.exe`) and WiX (`.msi`) installers on Windows:
```bash
npm run tauri build
```
