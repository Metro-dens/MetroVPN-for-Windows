# Third-Party Licenses & Open-Source Notices

**Metrovpn for Windows** (`site.metrodens.metrovpn`) is licensed under the **MIT License** (see [`LICENSE`](LICENSE)).

Metrovpn for Windows bundles and/or depends on the following third-party open-source components. Each bundled external binary (`xray.exe`, `tun2socks.exe`, `wintun.dll`) is distributed **unmodified** as a separate standalone file/process alongside the Metrovpn application (constituting an aggregate rather than a combined derivative work under GPL-3.0 Section 5) and remains governed by its own respective license.

---

## 1. Bundled Core Binaries & Data Assets

### Xray-core (`xray.exe` — `v26.11.9`)
- **Copyright:** Project X / XTLS Contributors
- **License:** Mozilla Public License 2.0 (**MPL-2.0**) — full text in [`licenses/MPL-2.0.txt`](licenses/MPL-2.0.txt)
- **Source Code:** <https://github.com/XTLS/Xray-core>
- **Exact Version Source:** <https://github.com/XTLS/Xray-core/releases/tag/v26.11.9>
- **Distribution Notice:** Shipped as an unmodified prebuilt executable (`xray.exe`) invoked as an external process. Source code is publicly available under MPL-2.0 at the URLs above.

### tun2socks (`tun2socks.exe` — `v2.7.0`)
- **Copyright:** Copyright (c) xjasonlyu and contributors
- **License:** GNU General Public License v3.0 (**GPL-3.0**) — full text in [`licenses/GPL-3.0.txt`](licenses/GPL-3.0.txt)
- **Source Code:** <https://github.com/xjasonlyu/tun2socks>
- **Exact Corresponding Source (`v2.7.0`):** <https://github.com/xjasonlyu/tun2socks/releases/tag/v2.7.0> / <https://github.com/xjasonlyu/tun2socks/archive/refs/tags/v2.7.0.tar.gz>
- **GPL-3.0 Compliance & Aggregation Notice:** `tun2socks.exe` is distributed unmodified as a separate standalone command-line executable invoked by Metrovpn over OS process spawning and standard TCP/UDP loopback sockets (`127.0.0.1:10808`), without linking into `Metrovpn.exe`. In accordance with GNU GPL v3.0 Sections 4, 5, and 6, the full GPL-3.0 license text is included in `licenses/GPL-3.0.txt`, and the exact Corresponding Source for `tun2socks v2.7.0` is available at the links above (or upon request via <https://github.com/Metro-dens/MetroVPN-for-Windows/issues>).

### Wintun (`wintun.dll`)
- **Copyright:** Copyright (C) 2018-2021 WireGuard LLC. All Rights Reserved.
- **License:** WireGuard Wintun Prebuilt Binary License / GNU General Public License v2.0 (**GPL-2.0**) — full GPL-2.0 text in [`licenses/GPL-2.0.txt`](licenses/GPL-2.0.txt)
- **Homepage & Source Code:** <https://www.wintun.net/> | <https://git.zx2c4.com/wintun>
- **Distribution Notice:** `wintun.dll` is the unmodified, Microsoft-signed prebuilt Wintun driver DLL redistributed alongside `tun2socks.exe` in accordance with the Wintun redistribution terms.

### GeoIP & GeoSite Routing Databases (`geoip.dat`, `geosite.dat`)
- **v2fly/geoip (`geoip.dat`):** Licensed under **CC-BY-SA-4.0** (<https://github.com/v2fly/geoip>).
  - *MaxMind Attribution:* This product includes GeoLite2 data created by MaxMind, available from <https://www.maxmind.com>.
- **v2fly/domain-list-community (`geosite.dat`):** Licensed under the **MIT License** (<https://github.com/v2fly/domain-list-community>).

---

## 2. Desktop Framework & Rust Dependencies

| Component | License | Upstream |
| :--- | :--- | :--- |
| Tauri v2 (`tauri`, `tauri-plugin-shell`, `tauri-plugin-store`, `tauri-plugin-clipboard-manager`, `tauri-plugin-autostart`, `tauri-plugin-dialog`) | Apache-2.0 OR MIT | <https://github.com/tauri-apps/tauri> |
| Tokio (`tokio`, `tokio-rustls`) | MIT | <https://github.com/tokio-rs/tokio> |
| Reqwest (`reqwest`) | MIT OR Apache-2.0 | <https://github.com/seanmonstar/reqwest> |
| Rustls (`rustls`) | Apache-2.0 OR ISC OR MIT | <https://github.com/rustls/rustls> |
| Serde & Serde JSON (`serde`, `serde_json`) | MIT OR Apache-2.0 | <https://github.com/serde-rs/serde> |
| `h2`, `http`, `bytes`, `futures-util`, `url`, `base64`, `sha2`, `chrono`, `uuid`, `flate2`, `image` | MIT OR Apache-2.0 | <https://crates.io/> |
| `rqrr` (QR Code Decoder) | MIT OR Apache-2.0 | <https://github.com/WanzenBug/rqrr> |
| `windows-sys` & `winreg` | MIT OR Apache-2.0 | <https://github.com/microsoft/windows-rs> |

Full Apache License 2.0 text is provided in [`licenses/APACHE-2.0.txt`](licenses/APACHE-2.0.txt).

---

## 3. Frontend JavaScript Libraries

| Component | License | Upstream |
| :--- | :--- | :--- |
| React & React DOM | MIT | <https://github.com/facebook/react> |
| Vite & `@vitejs/plugin-react` | MIT | <https://github.com/vitejs/vite> |
| Tailwind CSS | MIT | <https://github.com/tailwindlabs/tailwindcss> |
| Framer Motion | MIT | <https://github.com/motiondivision/motion> |
| `qrcode` (QR Code Generator) | MIT | <https://github.com/soldair/node-qrcode> |
| `jsQR` (Webcam QR Decoder) | Apache-2.0 | <https://github.com/cozmo/jsQR> |
| Lucide React (`lucide-react`) | ISC | <https://github.com/lucide-icons/lucide> |

---

## 4. License Compliance Contact

If you believe any third-party attribution, copyright notice, or source offer requires correction or update, please open an issue at <https://github.com/Metro-dens/MetroVPN-for-Windows/issues> and it will be addressed promptly.
