/**
 * Fixes webosbrew/youtube-webos/issues/343 without breaking casting
 * (webosbrew/youtube-webos/issues/401)
 *
 * The webOS 2025 built-in Chromecast ("cast core") service conflicts with the
 * app and freezes it, so waking it is blocked. On older firmware the same call
 * is what lets the mobile app push a video into the TV's player, so the block
 * is only applied where the conflict actually exists. Even there it is skipped
 * when the app was itself started by a cast (DIAL / Cast Connect) launch, and
 * it can be switched off from the settings panel.
 */

import { configRead } from './config';
import { FetchRegistry } from './hooks';
import { hasCastCoreConflict } from './tv-specs';
import { contentTargetOf } from './utils';

// `dialLaunch`/`pairingCode` mark a DIAL launch, `cc2` a Cast Connect one.
const CAST_LAUNCH_PARAMS = ['dialLaunch', 'pairingCode', 'cc2'];

function hasCastParams(query: string): boolean {
  try {
    const params = new URLSearchParams(query);
    return CAST_LAUNCH_PARAMS.some((key) => params.has(key));
  } catch {
    return false;
  }
}

function isCastLaunch(params: unknown): boolean {
  const contentTarget = contentTargetOf(params);
  if (typeof contentTarget !== 'string') return false;

  const queryStart = contentTarget.indexOf('?');

  return hasCastParams(
    queryStart === -1 ? contentTarget : contentTarget.slice(queryStart + 1)
  );
}

if (hasCastCoreConflict()) {
  // handleLaunch() folds the launch params into the YouTube URL, and a later
  // cast launch arrives as a webOSRelaunch while the app is already running.
  let castLaunch = hasCastParams(window.location.search);

  document.addEventListener(
    'webOSRelaunch',
    (evt) => {
      if (isCastLaunch((evt as CustomEvent).detail)) castLaunch = true;
    },
    true
  );

  FetchRegistry.getInstance().addEventListener('request', (evt) => {
    const { url } = evt.detail;
    if (url.pathname !== '/wake_cast_core') return;
    if (castLaunch || !configRead('blockWebosCast')) return;
    evt.preventDefault();
  });
}
