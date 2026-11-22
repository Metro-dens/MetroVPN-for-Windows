fn main() {
    println!("cargo:rerun-if-changed=metrovpn.exe.manifest");
    let windows = tauri_build::WindowsAttributes::new()
        .app_manifest(include_str!("metrovpn.exe.manifest"));
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run tauri-build");
}
