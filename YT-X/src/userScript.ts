import { handleRelaunch } from './core/utils';

document.addEventListener(
  'webOSRelaunch',
  (evt) => {
    handleRelaunch(evt.detail);
  },
  true
);

import './youtube/app_api/index';
import './features/adblock/adblock.js';
import './youtube/hooks/json-stringify';
import './features/adblock/shorts.js';
import './features/adblock/members-only.js';
import './features/sponsorblock/sponsorblock.js';
import './ui/ui.js';
import './styles/font-fix.css';
import './features/adblock/thumbnail-quality.js';
import './platform/screensaver-fix';
import './styles/yt-fixes.css';
import './features/playback/video-quality';
import './youtube/mods/lang-settings-fix';
import './features/adblock/remove-endscreen';
import './features/playback/force-codec.js';
import './features/playback/previews';
import './features/keep-playing/keep-playing';
import './youtube/hooks';
import './platform/block-webos-cast';
import './youtube/mods/auto-account-select';
import './ui/time-remaining';
import './features/keyboard-search/keyboard-search.js';
