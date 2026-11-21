$ErrorActionPreference = "Stop"

$xrayVersion = "v26.11.9"
$tunVersion = "v2.7.0"

New-Item -ItemType Directory -Force -Path "src-tauri/binaries", "src-tauri/resources" | Out-Null

if (-not (Test-Path "src-tauri/binaries/xray-x86_64-pc-windows-msvc.exe")) {
    Write-Host "Downloading Xray-core $xrayVersion..."
    $xrayZip = "$env:TEMP/Xray-windows-64.zip"
    $xrayDir = "$env:TEMP/xray-extract"
    Invoke-WebRequest -Uri "https://github.com/XTLS/Xray-core/releases/download/$xrayVersion/Xray-windows-64.zip" -OutFile $xrayZip
    Expand-Archive -Path $xrayZip -DestinationPath $xrayDir -Force
    Copy-Item "$xrayDir/xray.exe" "src-tauri/binaries/xray-x86_64-pc-windows-msvc.exe" -Force
    Copy-Item "$xrayDir/wintun.dll" "src-tauri/resources/wintun.dll" -Force
    Copy-Item "$xrayDir/geoip.dat" "src-tauri/resources/geoip.dat" -Force
    Copy-Item "$xrayDir/geosite.dat" "src-tauri/resources/geosite.dat" -Force
}

if (-not (Test-Path "src-tauri/binaries/tun2socks-x86_64-pc-windows-msvc.exe")) {
    Write-Host "Downloading tun2socks $tunVersion..."
    $tunZip = "$env:TEMP/tun2socks-windows-amd64.zip"
    $tunDir = "$env:TEMP/tun2socks-extract"
    Invoke-WebRequest -Uri "https://github.com/xjasonlyu/tun2socks/releases/download/$tunVersion/tun2socks-windows-amd64.zip" -OutFile $tunZip
    Expand-Archive -Path $tunZip -DestinationPath $tunDir -Force
    Copy-Item "$tunDir/tun2socks-windows-amd64.exe" "src-tauri/binaries/tun2socks-x86_64-pc-windows-msvc.exe" -Force
}

Write-Host "All Windows core binaries and resources ready."
