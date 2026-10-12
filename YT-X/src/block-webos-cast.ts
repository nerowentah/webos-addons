/**
 * Fixes webosbrew/youtube-webos/issues/343
 *
 * The webOS 2025 built-in Chromecast ("cast core") service conflicts with the
 * app and freezes it, so waking it is blocked. On older firmware the same call
 * is what lets the mobile app push a video into the TV's player, so the block
 * is only applied where the conflict actually exists.
 */

import { FetchRegistry } from './hooks';
import { hasCastCoreConflict } from './tv-specs';

if (hasCastCoreConflict()) {
  FetchRegistry.getInstance().addEventListener('request', (evt) => {
    const { url } = evt.detail;
    if (url.pathname === '/wake_cast_core') evt.preventDefault();
  });
}
