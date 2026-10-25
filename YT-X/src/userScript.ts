import './platform/cobalt-polyfills';
import { handleRelaunch } from './core/utils';

document.addEventListener(
  'webOSRelaunch',
  (evt) => {
    handleRelaunch(evt.detail);
  },
  true
);

import './youtube/app_api/index';
import './features/adblock/adblock';
import './youtube/hooks/json-stringify';
import './features/adblock/shorts';
import './features/adblock/members-only';
import './features/sponsorblock/sponsorblock';
import './ui/ui';
import './styles/font-fix.css';
import './features/adblock/thumbnail-quality';
import './platform/screensaver-fix';
import './styles/yt-fixes.css';
import './features/playback/video-quality';
import './youtube/mods/lang-settings-fix';
import './features/adblock/remove-endscreen';
import './features/playback/force-codec';
import './features/playback/previews';
import './features/keep-playing/keep-playing';
import './youtube/hooks';
import './platform/block-webos-cast';
import './youtube/mods/auto-account-select';
import './ui/time-remaining';
import './features/keyboard-search/keyboard-search';
