import { confirmQuit } from './files';
import { ask, editor, ui } from './state.svelte';

const isTauri = () => '__TAURI_INTERNALS__' in window;
const isMobile = () => /Android|iPhone|iPad/i.test(navigator.userAgent);
/** The desktop app updates itself; phones and browsers don't. */
export const canSelfUpdate = () => isTauri() && !isMobile();
export const RELEASES_URL = 'https://github.com/OmniFries/DLite/releases/latest';

export async function appVersion(): Promise<string> {
  if (isTauri()) {
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      return await getVersion();
    } catch {
      /* fall through */
    }
  }
  return __APP_VERSION__;
}

let checking = false;

/**
 * Looks for a newer release on GitHub. Automatic checks stay silent unless an
 * update exists; a manual check also says "You're up to date" or why it failed.
 */
export async function checkForUpdates(manual: boolean) {
  if (!canSelfUpdate()) {
    if (manual) editor.toast('Get the newest version from GitHub Releases.');
    return;
  }
  if (checking) return;
  checking = true;
  try {
    if (manual) editor.toast('Checking for updates…');
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) {
      if (manual) editor.toast("You're up to date");
      return;
    }
    const choice = await ask(
      `DLite ${update.version} is available`,
      `You have ${update.currentVersion}. The update downloads now and DLite restarts when it's ready.`,
      [
        { id: 'later', label: 'Later' },
        { id: 'install', label: 'Update & restart', kind: 'filled' },
      ],
    );
    if (choice !== 'install') return;
    // Unsaved drawings come first.
    if (!(await confirmQuit())) return;

    let total = 0, done = 0;
    await update.downloadAndInstall((ev) => {
      if (ev.event === 'Started') total = ev.data.contentLength ?? 0;
      else if (ev.event === 'Progress') {
        done += ev.data.chunkLength;
        ui.toast = total ? `Downloading update… ${Math.min(100, Math.round((done / total) * 100))}%` : 'Downloading update…';
      } else if (ev.event === 'Finished') ui.toast = 'Installing update…';
    });
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (err) {
    if (manual) editor.toast(`Couldn't check for updates: ${(err as Error)?.message ?? err}`);
    else console.warn('Update check failed', err);
  } finally {
    checking = false;
  }
}

/** Checks quietly a few seconds after the desktop app starts. */
export function scheduleUpdateCheck() {
  if (canSelfUpdate()) setTimeout(() => void checkForUpdates(false), 5000);
}
