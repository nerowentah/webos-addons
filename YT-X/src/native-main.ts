// The native Cobalt build's full bundle. It loads the same feature modules as
// userScript.ts, one at a time, so a module that throws on Cobalt (a missing
// API, an unexpected page object) costs only its own feature instead of every
// module after it. Each result is kept in `window.__ytxModules` (and localStorage
// `ytx-modules`) for the debug port; a failure also lands in `ytx-err`.
//
// Keep the module list equal to userScript.ts, apart from the web-only and
// native-only modules named in tools/native-main.test.ts, which checks it.
//
// Debugging: `localStorage['ytx-skip']` holds module names (comma-separated, as in
// the list below) to leave out, so a misbehaving module can be found by bisecting
// from the debug port without rebuilding. Empty by default.
import './platform/cobalt-polyfills';
import { handleRelaunch } from './core/utils';

document.addEventListener(
  'webOSRelaunch',
  (evt) => {
    handleRelaunch(evt.detail);
  },
  true
);

type Loader = () => Promise<unknown>;

const modules: ReadonlyArray<readonly [string, Loader]> = [
  [
    './youtube/app_api/index',
    () => import(/* webpackMode: "eager" */ './youtube/app_api/index')
  ],
  [
    './features/adblock/adblock',
    () => import(/* webpackMode: "eager" */ './features/adblock/adblock')
  ],
  [
    './youtube/hooks/json-stringify',
    () => import(/* webpackMode: "eager" */ './youtube/hooks/json-stringify')
  ],
  [
    './features/adblock/shorts',
    () => import(/* webpackMode: "eager" */ './features/adblock/shorts')
  ],
  [
    './features/adblock/members-only',
    () => import(/* webpackMode: "eager" */ './features/adblock/members-only')
  ],
  ['./ui/ui', () => import(/* webpackMode: "eager" */ './ui/ui')],
  [
    './styles/font-fix.css',
    () => import(/* webpackMode: "eager" */ './styles/font-fix.css')
  ],
  [
    './features/adblock/thumbnail-quality',
    () =>
      import(/* webpackMode: "eager" */ './features/adblock/thumbnail-quality')
  ],
  [
    './platform/screensaver-fix',
    () => import(/* webpackMode: "eager" */ './platform/screensaver-fix')
  ],
  [
    './styles/hide-offers.css',
    () => import(/* webpackMode: "eager" */ './styles/hide-offers.css')
  ],
  [
    './features/playback/video-quality',
    () => import(/* webpackMode: "eager" */ './features/playback/video-quality')
  ],
  [
    './youtube/mods/lang-settings-fix',
    () => import(/* webpackMode: "eager" */ './youtube/mods/lang-settings-fix')
  ],
  [
    './features/adblock/remove-endscreen',
    () =>
      import(/* webpackMode: "eager" */ './features/adblock/remove-endscreen')
  ],
  [
    './features/playback/force-codec',
    () => import(/* webpackMode: "eager" */ './features/playback/force-codec')
  ],
  [
    './features/playback/playback-speed',
    () =>
      import(/* webpackMode: "eager" */ './features/playback/playback-speed')
  ],
  [
    './features/playback/native-previews',
    () =>
      import(/* webpackMode: "eager" */ './features/playback/native-previews')
  ],
  [
    './features/keep-playing/keep-playing',
    () =>
      import(/* webpackMode: "eager" */ './features/keep-playing/keep-playing')
  ],
  [
    './youtube/hooks',
    () => import(/* webpackMode: "eager" */ './youtube/hooks')
  ],
  [
    './platform/block-webos-cast',
    () => import(/* webpackMode: "eager" */ './platform/block-webos-cast')
  ],
  [
    './youtube/mods/auto-account-select',
    () =>
      import(/* webpackMode: "eager" */ './youtube/mods/auto-account-select')
  ],
  [
    './ui/time-remaining',
    () => import(/* webpackMode: "eager" */ './ui/time-remaining')
  ],
  [
    './features/keyboard-search/keyboard-search',
    () =>
      import(
        /* webpackMode: "eager" */ './features/keyboard-search/keyboard-search'
      )
  ]
];

interface NativeGlobals {
  __ytxModules?: Record<string, string>;
  __ytxErrs?: string[];
}

function save(host: NativeGlobals): void {
  try {
    window.localStorage.setItem(
      'ytx-modules',
      JSON.stringify(host.__ytxModules)
    );
    if (host.__ytxErrs) {
      window.localStorage.setItem(
        'ytx-err',
        JSON.stringify(host.__ytxErrs.slice(0, 8))
      );
    }
  } catch {
    // Storage can be unavailable; window.__ytxModules still has the result.
  }
}

// Started in order but not awaited one by one: a module that waits for a
// YouTube object (top-level await) must not hold the ones after it.
function skippedModules(): string[] {
  try {
    return (window.localStorage.getItem('ytx-skip') ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function loadAll(): void {
  const host = window as unknown as NativeGlobals;
  const status = (host.__ytxModules ??= {});
  const skipped = skippedModules();
  for (const [name, load] of modules) {
    if (skipped.includes(name)) {
      status[name] = 'skipped';
      continue;
    }
    status[name] = 'loading';
    load().then(
      () => {
        status[name] = 'ok';
        save(host);
      },
      (error: unknown) => {
        const text = error instanceof Error ? error.message : String(error);
        status[name] = `error: ${text}`.slice(0, 160);
        (host.__ytxErrs ??= []).push(`M ${name} ${text}`.slice(0, 300));
        save(host);
      }
    );
  }
}

loadAll();
