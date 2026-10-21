// Block waking the webOS 2025 "cast core" service, which freezes the app
// (webosbrew/youtube-webos/issues/343), except where it breaks casting (issues/401).

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
