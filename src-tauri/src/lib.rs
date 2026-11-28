pub mod models;
pub mod network_win;
pub mod parser;
pub mod ping;
pub mod speedtest;
pub mod tls_probe;
pub mod vpn_manager;
pub mod xray_config;
pub mod xray_stats;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, RunEvent, WindowEvent,
};
use vpn_manager::{
    add_custom_windows_app, cancel_screen_snip, check_github_update, clear_logs,
    connect_internal, connect_server, decode_qr_image, delete_server, disconnect,
    download_and_install_update, emit_status, finish_screen_snip, get_logs, get_settings,
    get_snip_preview, get_status, import_subscription, import_uri, is_admin, list_servers,
    quit_app, reconnect_active, refresh_local_ip, reset_settings, restart_as_admin,
    scan_screen_qr, scan_windows_apps, start_screen_snip, sync_all_quotas,
    sync_all_quotas_internal, sync_node_quota, toggle_star, update_all_subscriptions,
    update_server, update_settings, verify_tunnel, AppState,
};

fn toggle_tray_flyout(app: &tauri::AppHandle) {
    let Some(tray_win) = app.get_webview_window("tray") else {
        return;
    };
    if tray_win.is_visible().unwrap_or(false) {
        let _ = tray_win.hide();
        return;
    }

    if let Ok(Some(monitor)) = tray_win.primary_monitor() {
        let work = monitor.work_area();
        let scale = monitor.scale_factor();
        let w = (320.0 * scale) as i32;
        let h = (420.0 * scale) as i32;
        let margin = (12.0 * scale) as i32;
        let x = work.position.x + (work.size.width as i32) - w - margin;
        let y = work.position.y + (work.size.height as i32) - h - margin;
        let _ = tray_win.set_position(PhysicalPosition::new(x, y));
    }

    let _ = tray_win.show();
    let _ = tray_win.set_focus();
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
    if let Some(tray_win) = app.get_webview_window("tray") {
        let _ = tray_win.hide();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if !network_win::acquire_single_instance_or_focus() {
        return;
    }

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("Metrovpn"));
            let state = AppState::new(app_data_dir);

            // Install panic hook so Windows System Proxy & child processes are always restored
            let panic_state = state.clone();
            let prev_hook = std::panic::take_hook();
            std::panic::set_hook(Box::new(move |info| {
                panic_state.cleanup_all();
                prev_hook(info);
            }));

            app.manage(state.clone());

            // Build native System Tray context menu
            let toggle_conn_item =
                MenuItem::with_id(app, "toggle_connect", "Connect / Disconnect", true, None::<&str>)?;
            let toggle_mode_item =
                MenuItem::with_id(app, "toggle_mode", "Mode: System Proxy / TUN", true, None::<&str>)?;
            let open_item =
                MenuItem::with_id(app, "open_app", "Open Metrovpn", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let tray_menu = Menu::with_items(
                app,
                &[
                    &toggle_conn_item,
                    &toggle_mode_item,
                    &open_item,
                    &quit_item,
                ],
            )?;

            let initial_icon =
                tauri::image::Image::from_bytes(include_bytes!("../icons/tray-disconnected.png"))?;

            TrayIconBuilder::with_id("metrovpn-tray")
                .icon(initial_icon)
                .tooltip("Metrovpn • Disconnected")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_tray_flyout(tray.app_handle());
                    }
                })
                .on_menu_event(|app, event| {
                    let state = app.state::<AppState>().inner().clone();
                    match event.id.as_ref() {
                        "open_app" => show_main_window(app),
                        "quit" => {
                            state.cleanup_all();
                            let _ = app.remove_tray_by_id("metrovpn-tray");
                            app.exit(0);
                        }
                        "toggle_connect" => {
                            let app_h = app.clone();
                            let st_c = state.clone();
                            tauri::async_runtime::spawn(async move {
                                let (is_conn, node_id, mode) = {
                                    let Ok(g) = st_c.inner.lock() else { return };
                                    (
                                        g.status == "Connected" || g.status == "Connecting",
                                        g.store
                                            .settings
                                            .active_node_id
                                            .clone()
                                            .or_else(|| g.store.servers.first().map(|s| s.id.clone())),
                                        g.store.settings.system_mode.clone(),
                                    )
                                };
                                if is_conn {
                                    st_c.cleanup_all();
                                    st_c.push_log(Some(&app_h), "Info", "Disconnected from Tray");
                                    emit_status(&app_h, &st_c);
                                } else if let Some(id) = node_id {
                                    let _ = connect_internal(app_h, st_c, id, mode).await;
                                }
                            });
                        }
                        "toggle_mode" => {
                            let app_h = app.clone();
                            let st_c = state.clone();
                            tauri::async_runtime::spawn(async move {
                                let (was_conn, node_id, next_mode) = {
                                    let Ok(mut g) = st_c.inner.lock() else { return };
                                    let next = if g.store.settings.system_mode == "TUN" {
                                        "PROXY".to_string()
                                    } else {
                                        "TUN".to_string()
                                    };
                                    if next == "TUN" && !network_win::is_elevated() {
                                        drop(g);
                                        st_c.push_log(
                                            Some(&app_h),
                                            "Warning",
                                            "TUN Mode requires Administrator privileges — open Metrovpn to elevate",
                                        );
                                        show_main_window(&app_h);
                                        return;
                                    }
                                    g.store.settings.system_mode = next.clone();
                                    let was_c = g.status == "Connected";
                                    let id = g
                                        .store
                                        .settings
                                        .active_node_id
                                        .clone()
                                        .or_else(|| g.store.servers.first().map(|s| s.id.clone()));
                                    (was_c, id, next)
                                };
                                st_c.persist();
                                emit_status(&app_h, &st_c);
                                if was_conn {
                                    if let Some(id) = node_id {
                                        let _ = connect_internal(app_h, st_c, id, next_mode).await;
                                    }
                                }
                            });
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Hide main window on launch if started silently with --minimized
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(main_win) = app.get_webview_window("main") {
                    let _ = main_win.hide();
                }
            }

            // Auto-connect active server if enabled in settings, and sync initial 3x-ui quota
            {
                let (should_auto, node_id_opt, mode) = {
                    let Ok(g) = state.inner.lock() else {
                        return Ok(());
                    };
                    (
                        g.store.settings.auto_connect_on_launch,
                        g.store
                            .settings
                            .active_node_id
                            .clone()
                            .or_else(|| g.store.servers.first().map(|s| s.id.clone())),
                        g.store.settings.system_mode.clone(),
                    )
                };
                let app_h = app.handle().clone();
                let st_c = state.clone();
                if let (true, Some(id)) = (should_auto, node_id_opt) {
                    tauri::async_runtime::spawn(async move {
                        let _ = connect_internal(app_h, st_c, id, mode).await;
                    });
                } else {
                    tauri::async_runtime::spawn(async move {
                        let _ = sync_all_quotas_internal(&app_h, &st_c).await;
                    });
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            match window.label() {
                "main" => {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let close_to_tray = window
                            .app_handle()
                            .try_state::<AppState>()
                            .and_then(|st| st.inner.lock().ok().map(|g| g.store.settings.close_to_tray))
                            .unwrap_or(true);
                        if close_to_tray {
                            api.prevent_close();
                            let _ = window.hide();
                        } else {
                            if let Some(st) = window.app_handle().try_state::<AppState>() {
                                st.cleanup_all();
                            }
                            let _ = window.app_handle().remove_tray_by_id("metrovpn-tray");
                        }
                    }
                }
                "tray" => {
                    if let WindowEvent::Focused(false) = event {
                        let _ = window.hide();
                    }
                }
                "snip" => {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window.hide();
                        if let Some(main_win) = window.app_handle().get_webview_window("main") {
                            let _ = main_win.show();
                            let _ = main_win.unminimize();
                            let _ = main_win.set_focus();
                        }
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            import_uri,
            import_subscription,
            update_all_subscriptions,
            decode_qr_image,
            scan_screen_qr,
            start_screen_snip,
            get_snip_preview,
            finish_screen_snip,
            cancel_screen_snip,
            list_servers,
            update_server,
            delete_server,
            toggle_star,
            connect_server,
            disconnect,
            reconnect_active,
            verify_tunnel,
            get_status,
            get_settings,
            update_settings,
            reset_settings,
            check_github_update,
            download_and_install_update,
            sync_node_quota,
            sync_all_quotas,
            get_logs,
            clear_logs,
            refresh_local_ip,
            is_admin,
            restart_as_admin,
            scan_windows_apps,
            add_custom_windows_app,
            quit_app,
            ping::ping_server,
            ping::ping_all_servers,
            speedtest::run_speed_test,
            speedtest::get_speed_history,
            speedtest::clear_speed_history,
        ]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building Metrovpn application");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
            if let Some(state) = app_handle.try_state::<AppState>() {
                state.cleanup_all();
            }
            if matches!(event, RunEvent::Exit) {
                let _ = app_handle.remove_tray_by_id("metrovpn-tray");
            }
        }
    });
}
