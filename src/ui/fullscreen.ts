import { ui } from './state.svelte';

const isTauri = () => '__TAURI_INTERNALS__' in window;
const isMobile = () => /Android|iPhone|iPad/i.test(navigator.userAgent);

/**
 * Fullscreen mode: the window fills the screen (desktop app or browser), and
 * the top bar and tabs are hidden so the canvas gets the space. If the system
 * can't go fullscreen (e.g. some phones), the app still hides its own chrome.
 */
export async function setFullscreen(on: boolean) {
  ui.fullscreen = on;
  ui.openSetting = null;
  try {
    if (isTauri() && !isMobile()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setFullscreen(on);
    } else if (on && document.fullscreenEnabled && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } else if (!on && document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    /* system fullscreen not available: the app-level mode still applies */
  }
}

export const toggleFullscreen = () => setFullscreen(!ui.fullscreen);

// Browser fullscreen can also end with Esc or a system gesture; keep in sync.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && ui.fullscreen && !isTauri()) ui.fullscreen = false;
});
