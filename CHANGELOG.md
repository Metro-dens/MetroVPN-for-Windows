# Changelog

## [v2.6.0] - 2026-11-21

### Fixed & Redesigned
- **Compact NetMod-Inspired Desktop Window (`520×620`):** Eliminated main screen cropping/overflow by redesigning Home, Servers, Speed, Settings, and the compact left rail for a crisp `520×620` window.
- **No Hover Flicker:** Removed cursor-shifting `whileHover` transform animations across cards and buttons so mouse hover transitions stay smooth and flicker-free.
- **Fixed Zigzag & Chart Overshoot:** Replaced the erratic zigzag quota line with a smooth pill progress bar and clamped live throughput sparklines cleanly inside card bounds.
- **Interactive Step-by-Step Guide Tour:** Fixed the `systemMode` crash in onboarding and replaced the static card modal with a live 4-step walkthrough that automatically switches between `Home`, `Servers`, and `Settings → TUN & DNS`.
- **Real Server Quota & Live Rolling Telemetry Stream:** Removed fake `100 GB` defaults on URI/JSON imports, accumulated live Xray stats into each node's real persistent usage (`KB / MB / GB`), and wired `Speed → Realtime Telemetry Stream` to a 350ms rolling throughput buffer with live `↓ / ↑` readouts.
- **Windows PC Split Tunneling Scanner:** `WindowsAppsModal` now scans real running processes, Registry Uninstall entries, and `Program Files` / `%LocalAppData%\Programs` to list actual `.exe` apps on the user's PC alongside `Browse .exe`.
- **Separated `+ Add` and `QR Scan` Flows:** `+ Add` now focuses strictly on `vless://` / `vmess://` URI import; clicking the QR button opens a dedicated QR Scanner featuring **NetMod-style Screen Capture QR** (native Windows GDI capture) and **Live Camera QR** (`getUserMedia` + `jsQR`).
- **Prevented Duplicate System Tray Icons:** Enforced a Windows single-instance named mutex (`MetrovpnSingleInstanceMutex`) that focuses the running window instead of spawning duplicates, and explicitly removes the tray icon (`Shell_NotifyIconW(NIM_DELETE)`) on exit/relaunch.
- **Simplified 3-Tab Settings (`General`, `TUN & DNS`, `About & Guide`):** Removed `Subs & Speed` and advanced clutter; added plain-English explanations comparing **System Proxy Mode** vs **TUN Mode**.

## [v2.5.1] - 2026-11-21

### Fixed
- **App Launch Crash (Black Window):** Fixed missing `lucide-react` icon imports (`Cpu`, `ExternalLink`, `HelpCircle`, `Lock`, `RotateCcw`, `Send`) and `openExternalUrl` import in `src/App.jsx` that caused a `ReferenceError` on startup, plus added an inline React `ErrorBoundary` fallback.
- **Titlebar Drag Region & Guide Button:** Moved `data-tauri-drag-region` exclusively to the left titlebar spacer so top-bar action buttons are always clickable, and added the `?` Onboarding Guide button to the titlebar.
- **Removed Window Maximize Feature:** Disabled `maximizable` and `resizable` on the main window in `tauri.conf.json` and removed the maximize/restore button from the custom titlebar.

## [v2.5.0] - 2026-11-21

### Fixed & Improved
- **First-Run User Guidance (Onboarding):** Added a 3-step interactive onboarding modal (`OnboardingGuideModal`) guiding new users through importing servers/subscriptions, choosing System Proxy vs Admin Wintun TUN mode, and using Strict VCN / TLS Frag / System Tray. Accessible anytime via the `?` button in the titlebar or `Settings → About & Guide`.
- **Clean First-Launch Server List & Last-Node Deletion:** Removed the dead dummy `sg01.metrovpn.io` seed server (`100 GB` fake quota) and fixed `delete_server` so users can delete every server cleanly.
- **Offline-Safe UI Rendering & Fixed Window Dragging:** Removed external Google Fonts `@import` that stalled WebView2 startup before connecting; constrained `data-tauri-drag-region` strictly to the titlebar spacer so top-bar Minimize/Maximize/Close/Import buttons respond cleanly on Windows.
- **ISP & Node Badges Parity with MetroVPN Android:** Fixed Home Active Exit card and Speed screen header to render proper ISP badges (`SLT`, `Dialog`, `Hutch`, `Airtel`, `Mobitel`) cleanly with null-safe fallbacks.
- **No Keystroke Tunnel Drops:** Typing custom DoH URLs, ports, or routes in Settings no longer restarts the active VPN tunnel mid-typing; displays an `"Apply & Reconnect"` banner when tunnel-affecting changes are pending.
- **True Xray HTTP 204 Ping & Dynamic Speed Test Ports:** `ping.rs` now defaults to real `generate_204` delay through an ephemeral Xray instance (`Semaphore(6)` concurrency) alongside TCP+TLS handshake ping; `speedtest.rs` dynamically binds free localhost ports.
- **Windows Proxy & TUN Routing Reliability (`network_win.rs`):** Clears & backs up `AutoConfigURL` on System Proxy connect/disconnect, sets `netsh ... store=active` cleanly without duplicate gateway injection, applies MTU dynamically, and pins all resolved server IPv4 addresses.

### Added
- **5-Tab Settings Inspired by v2rayN, NekoRay & MetroVPN Android:**
  - `General & Proxy`: SOCKS5/HTTP ports, LAN Proxy Sharing, Auto-Connect on launch, Close-to-Tray behavior, Bypass LAN, custom Windows Proxy exceptions.
  - `TUN & Routing`: Routing Mode (`Rule`, `Global`, `Direct`), TUN Interface MTU, Strict Route, IPv6 control, Split Tunneling `.exe` exclusions, extra bypass CIDRs, and custom Fragment packets/length/interval.
  - `DNS & Security`: DoH resolvers (including Android's Cloudflare Malware-Block `1.1.1.2`), Bootstrap DNS, Strict VCN Cert Pinning, Allow-Insecure TLS fallback, uTLS fingerprint selector, and Xray Mux concurrency.
  - `Subs & Speed`: Persistent Subscription Manager with `"Update All Subscriptions"` + proxy toggle, plus Ping Mode (`Xray HTTP 204` vs `TCP+TLS`) & Speed Test target URL.
  - `About & Guide`: Direct `@MetroVpnPaidProof` / `@Metrodens_bot` / GitHub actions, in-app GitHub Release Update Checker, Reset to Defaults, and Onboarding Guide relaunch.

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
