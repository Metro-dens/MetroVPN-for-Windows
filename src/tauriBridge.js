import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

export const IN_TAURI = isTauri();

export async function invokeCmd(cmd, args = {}) {
  if (!IN_TAURI) {
    throw new Error(`Not running inside Tauri (${cmd})`);
  }
  return tauriInvoke(cmd, args);
}

export async function listenEvent(eventName, handler) {
  if (!IN_TAURI) {
    return () => {};
  }
  return tauriListen(eventName, (event) => handler(event.payload));
}

export async function copyClipboard(text) {
  if (IN_TAURI) {
    try {
      await writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export async function readClipboard() {
  if (IN_TAURI) {
    try {
      const txt = await readText();
      if (txt) return txt;
    } catch {
      // Fallback below
    }
  }
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      return await navigator.clipboard.readText();
    }
  } catch {
    // ignore
  }
  return '';
}

export async function pickExeFile() {
  if (!IN_TAURI) return null;
  const selected = await openDialog({
    multiple: false,
    title: 'Select Windows Executable (.exe) to Bypass',
    filters: [{ name: 'Windows Applications', extensions: ['exe'] }],
  });
  return typeof selected === 'string' ? selected : null;
}

export async function windowMinimize() {
  if (!IN_TAURI) return;
  await getCurrentWindow().minimize();
}

export async function windowToggleMaximize() {
  if (!IN_TAURI) return false;
  const win = getCurrentWindow();
  await win.toggleMaximize();
  return win.isMaximized();
}

export async function windowHide() {
  if (!IN_TAURI) return;
  await getCurrentWindow().hide();
}

export async function showMainWindowFromTray() {
  if (!IN_TAURI) return;
  const mainWin = await WebviewWindow.getByLabel('main');
  if (mainWin) {
    await mainWin.show();
    await mainWin.unminimize();
    await mainWin.setFocus();
  }
  const cur = getCurrentWindow();
  if (cur.label === 'tray') {
    await cur.hide();
  }
}

export function isTrayWindowMode() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('window') === 'tray';
}
