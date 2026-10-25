// Block waking the webOS 2025 "cast core" service, which freezes the app
// (webosbrew/youtube-webos/issues/343), except where it breaks casting (issues/401).
//
// Measured on a 65QNED86 (webOS 25, firmware 33.31.75): with the block on, a cold
// Cast start reported success but the TV stopped answering SSH, :8008 and DevTools
// and needed a power cycle; with it off, /wake_cast_core was allowed and the TV
// stayed responsive. Hence the default is off (config migration `nativeCastV1`
// switched existing installs off once). The setting cannot add, remove or rename
// a cast destination: the system Cast receiver and its DIAL device are advertised
// by webOS, and the app registers no DIAL name (`dialAppName` is omitted, so
// /apps/YouTube answers 404 with a browser-like Origin and UA; a bare request is
// a 403 and proves nothing). Rollback: restore "dialAppName": "YouTube" in
// assets/appinfo.json and rebuild.

import { configRead } from '../config/config';
import { FetchRegistry } from '../youtube/hooks';
import { hasCastCoreConflict } from './tv-specs';
import { contentTargetOf } from '../core/utils';

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
  // handleLaunch() folds launch params into the URL; a later cast launch arrives
  // as a webOSRelaunch while the app is already running.
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
