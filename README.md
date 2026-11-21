# MetroVPN for Windows

Native Windows 10/11 desktop client for **Metro Dens**, built with **React + Vite + Tailwind CSS + Framer Motion + Tauri v2 (Rust) + Xray-core (`v26.11.9`) + Wintun (`tun2socks`)**.

## Download & Install (Windows x64)

Download the latest release from [GitHub Releases](https://github.com/Metro-dens/MetroVPN-for-Windows/releases):

| File | Description |
| :--- | :--- |
| `Metrovpn_2.4.0_x64-setup.exe` | **Recommended Installer (NSIS)** — Installs Start Menu/Desktop shortcuts, WebView2 runtime check, and clean uninstaller. |
| `Metrovpn_2.4.0_x64_en-US.msi` | **MSI Enterprise Installer (WiX)** — Standard Windows Installer package. |
| `Metrovpn-standalone-x64.exe` | **Single-File Portable EXE** — Zero-install executable that extracts `xray.exe`, `tun2socks.exe`, `wintun.dll`, `geoip.dat`, and `geosite.dat` to `%AppData%\site.metrodens.metrovpn\core\` on first launch. |
| `Metrovpn-windows-x64-portable.zip` | **Portable Folder Archive** — Unzip anywhere and run `Metrovpn.exe`. |
| `SHA256SUMS.txt` | **Checksums** — Verify file integrity with `Get-FileHash <file> -Algorithm SHA256`. |

### System Requirements & First Run
- **OS:** Windows 10 (1809+) or Windows 11 (64-bit `x86_64`).
- **Runtime:** Microsoft Edge WebView2 Runtime (preinstalled on Windows 11; automatically fetched by the NSIS installer if missing).
- **Routing Permissions:**
  - **System Proxy Mode** runs without Administrator privileges.
  - **TUN Mode (`Metrovpn-TUN` via Wintun)** prompts via UAC (`Restart as Administrator`) when enabled.
- **Windows SmartScreen Note:** Early unsigned builds may show `"Windows protected your PC"` — verify the file hash against `SHA256SUMS.txt`, then click **More info → Run anyway**.

## Features

- **Crimson Void Material 3 Expressive Desktop UI:** Frameless Windows 11 shell (`1040×680`), 12-lobe scalloped crimson connect orb, live download/upload throughput sparklines, wavy quota bars, ISP server tabs (`SLT`, `Dialog`, `Hutch`, `Airtel`, `Mobitel`), and a `320×420` borderless System Tray flyout.
- **Xray-core Sidecar + Stats API:** Supports `vless://` (TLS, `vcn` `verifyPeerCertByName`, Reality, WS, gRPC, TCP, uTLS `chrome` fingerprint, `xtls-rprx-vision`), `vmess://`, raw `.json` profiles, subscription URL syncing, and QR image decoding.
- **Dual Windows Routing Modes:**
  - **System Proxy Mode (No Admin Required):** Configures `HKCU\...\Internet Settings` with `InternetSetOptionW` instant refresh, pre-VPN backup/restore, and automatic crash recovery on startup.
  - **TUN Mode (Full System via Wintun):** Routes all Windows TCP/UDP traffic through `Metrovpn-TUN` via `tun2socks`, with UAC elevation prompt (`Restart as Administrator`), custom MTU (`1500`/`1420`/`1280`), and Split Tunneling `.exe` exclusions.
- **Tunneling Profiles:** `Strict VCN`, `TLS Frag` (`dialerProxy` ClientHello fragmentation), and `Standard`, plus DoH resolvers (`Cloudflare 1.1.1.1`, `Google 8.8.8.8`, `Quad9 9.9.9.9`, or custom DoH) and LAN Proxy Sharing (`0.0.0.0:10808` / `:10809`).
- **Concurrent Ping & Cloudflare Speed Test:** Async `tokio::task::JoinSet` TCP/TLS handshake ping across all nodes and a 3-phase Cloudflare speed benchmark routed over Xray SOCKS5 with persistent history.

## Build from Source (Windows or Linux Cross-Compile)

### Fetch Sidecars & Resources
```powershell
.\scripts\fetch-core.ps1
```

### Build Frontend & Release Binary
```bash
npm install
npm run build
cd src-tauri
cargo build --release --target x86_64-pc-windows-msvc --features custom-protocol
```

Or build full NSIS (`.exe`) and WiX (`.msi`) installers on Windows:
```bash
npm run tauri build
```

## License

[MIT](LICENSE)
