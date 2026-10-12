import { handleLaunch } from './utils';

document.addEventListener(
  'webOSRelaunch',
  (evt) => {
    console.info('RELAUNCH:', evt, window.launchParams);
    handleLaunch(evt.detail);
  },
  true
);

import './app_api/index';
import './adblock.js';
import './hooks/json-stringify';
import './shorts.js';
import './members-only.js';
import './sponsorblock.js';
import './ui.js';
import './font-fix.css';
import './thumbnail-quality';
import './screensaver-fix';
import './yt-fixes.css';
import './video-quality';
import './lang-settings-fix';
import './remove-endscreen';
import './force-codec.js';
import './previews.js';
import './keep-playing.js';
import './hooks';
import './block-webos-cast';
import './auto-account-select';
