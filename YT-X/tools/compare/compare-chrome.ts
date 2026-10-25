/**
 * Chrome TV reference probe: launches desktop Chrome with the YouTube TV URI
 * and the TV's webOS user agent (or the PS4 Cobalt one), emulates a TV viewport and probes
 * the official control bar over CDP. Manual gate (needs Chrome and network);
 * not part of `npm test`, `verify` or CI. The on-TV probe stays authoritative.
 *
 *   node tools/compare/compare-chrome.ts --login      sign in once (desktop UA), then close Chrome
 *   node tools/compare/compare-chrome.ts              probe and write the report
 *   node tools/compare/compare-tv.ts                  emit the matching TV snapshot for --tv
 *   node tools/compare/compare-chrome.ts --help
 *
 * Gotchas:
 *  - Chrome may serve a different YouTube build than the TV, so exact colors
 *    and radii are reported as DIFF; only the hard invariants fail the run.
 *  - Never pixel-diff video: Chrome screenshots include it, the TV does not.
 *  - Chrome timing is informational, not a performance baseline.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  connectToPort,
  HarnessError,
  runCli,
  type Session
} from '../device/inspect.ts';

/** The UA the TV app sends: YouTube serves the LG webOS build (its own CSS/JS) to it, so it is the like-for-like reference. */
const WEBOS_UA =
  'LG Browser/8.00.00 (webOS.TV-2025), _TV_O18/33.31.75 (LG, 65QNED86ASA.ATSFLJD, wireless)';
/** The PS4 Cobalt UA serves a different build; kept as a cross-build reference. It omits the LG device tail that app-ua.ts adds, since a browser probe has no webOS template variables to fill. */
const COBALT_UA =
  'Mozilla/5.0 (PS4; Leanback Shell) Cobalt/24.lts.13.1032728-gold v8/8.8.278.8-jit gles Starboard/14';
const USER_AGENTS = { webos: WEBOS_UA, cobalt: COBALT_UA } as const;
/** The params the TV app loads youtube.com/tv with. */
const TV_PARAMS =
  'env_forceFullAnimation=1&env_enableWebSpeech=1&env_enableVoice=1';
const DEFAULT_URL = `https://www.youtube.com/tv?${TV_PARAMS}`;
const DEFAULT_WATCH = `https://www.youtube.com/tv?${TV_PARAMS}#/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ`;
const LOGIN_URL = 'https://www.youtube.com/';
const DEFAULT_PORT = 9222;
/** Frame both sides are paused at, so screenshots and styles compare 1:1. */
export const DEFAULT_TIME_S = 102;
export const VIEWPORT = { width: 1920, height: 1080 } as const;

// Set from --ua / --viewport in main(); module state so the CDP helpers stay argument-light.
let activeUA: string = WEBOS_UA;
let activeViewport: { width: number; height: number } = { ...VIEWPORT };
const DEFAULT_TIMEOUT_S = 90;

// --- Pure comparison logic (unit-tested without Chrome) ---------------------

export const STYLE_FIELDS = [
  'backgroundColor',
  'backgroundImage',
  'backdropFilter',
  'borderRadius',
  'opacity',
  'color',
  'boxShadow'
] as const;

export interface Style {
  backgroundColor: string;
  backgroundImage: string;
  backdropFilter: string;
  borderRadius: string;
  opacity: string;
  color: string;
  boxShadow: string;
}

export interface Entry {
  /** The selector that matched, or null when every candidate missed. */
  selector: string | null;
  style: Style | null;
}

/** Elements the probe records, each with fallback selectors in priority order. */
export const PROBE_SELECTORS = {
  bar: ['ytlr-player-actions-container'],
  pill: ['ytlr-player-actions-container .clJQEe', '.clJQEe'],
  leftButtons: [
    'ytlr-player-actions-container yt-button-container.CgA6bd.MIiKQd',
    'yt-button-container.CgA6bd.MIiKQd'
  ],
  rightButtons: [
    'ytlr-player-actions-container yt-button-container.CgA6bd.XqDMCd',
    'yt-button-container.CgA6bd.XqDMCd'
  ],
  titlePlate: ['ytlr-watch-metadata'],
  titleInner: ['ytlr-watch-default .LeWSF', '.LeWSF'],
  scrim: ["[idomkey='shadow']", '.ytLrWatchDefaultShadow'],
  player: ['ytlr-player'],
  transport: ["[idomkey='transport-controls']"],
  timeLabel: ["[idomkey='time-label']"],
  progressBar: ["[idomkey='progress-bar']"],
  slider: ["[idomkey='slider']"],
  playhead: ["[idomkey='playhead']"],
  pivot: ["[idomkey='pivot']", 'ytlr-pivot'],
  scrim2025: ['.ytLrWatchDefault2025Shadow'],
  nowPlaying: [
    'ytlr-thumbnail-overlay-now-playing-renderer.P21kJ',
    'ytlr-thumbnail-overlay-now-playing-renderer'
  ]
} as const;

export type ProbeKey = keyof typeof PROBE_SELECTORS;

export interface Snapshot {
  appPresent: boolean;
  entries: Record<ProbeKey, Entry>;
  tileImageUrl: string | null;
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parse a computed CSS color (`rgb()`, `rgba()`, `transparent`); null if unrecognised. */
export function parseColor(value: string | null | undefined): Rgba | null {
  if (value === undefined || value === null) return null;
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const m = /^rgba?\(([^()]*)\)$/.exec(v);
  if (!m?.[1]) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const channel = /^\d{1,3}$/;
  if (!parts.slice(0, 3).every((p) => channel.test(p))) return null;
  const [r, g, b] = parts.slice(0, 3).map(Number) as [number, number, number];
  if (r > 255 || g > 255 || b > 255) return null;
  let a = 1;
  if (parts[3] !== undefined) {
    const alpha = parts[3];
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(alpha)) return null;
    a = alpha.endsWith('%') ? Number.parseFloat(alpha) / 100 : Number(alpha);
  }
  if (a < 0 || a > 1) return null;
  return { r, g, b, a };
}

export type Coverage = 'opaque' | 'translucent' | 'transparent' | 'unknown';

/** Classify a background color, scaled by the element's own opacity. */
export function classifyCoverage(
  backgroundColor: string,
  opacity = '1'
): Coverage {
  const color = parseColor(backgroundColor);
  const o = Number(opacity);
  if (!color || !Number.isFinite(o) || o < 0 || o > 1) return 'unknown';
  const alpha = color.a * o;
  if (alpha === 0) return 'transparent';
  return alpha === 1 ? 'opaque' : 'translucent';
}

export function hasBackdropFilter(value: string | null | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return v !== '' && v !== 'none';
}

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/** Hard invariants: any failure fails the gate. */
export function evaluateInvariants(snap: Snapshot): Check[] {
  const checks: Check[] = [
    {
      name: 'ytlr-app present',
      pass: snap.appPresent,
      detail: snap.appPresent ? 'found' : 'missing'
    }
  ];
  const styleOf = (key: ProbeKey): Style | null => snap.entries[key].style;

  const noBackdrop: ProbeKey[] = [
    'bar',
    'pill',
    'leftButtons',
    'titlePlate',
    'titleInner',
    'scrim'
  ];
  for (const key of noBackdrop) {
    const style = styleOf(key);
    checks.push({
      name: `${key} backdrop-filter none`,
      pass: style !== null && !hasBackdropFilter(style.backdropFilter),
      detail: style ? style.backdropFilter || '(empty)' : 'element missing'
    });
  }

  checks.push({
    name: 'now-playing tile image present',
    pass: Boolean(snap.tileImageUrl),
    detail: snap.tileImageUrl ?? 'no image URL found'
  });
  return checks;
}

export interface Diff {
  key: ProbeKey;
  field: (typeof STYLE_FIELDS)[number];
  chrome: string;
  other: string;
}

/** Soft diffs between two snapshots (exact colors, gradients, radii, opacity). */
export function diffSnapshots(chrome: Snapshot, other: Snapshot): Diff[] {
  const diffs: Diff[] = [];
  for (const key of Object.keys(PROBE_SELECTORS) as ProbeKey[]) {
    const a = chrome.entries[key].style;
    const b = other.entries[key]?.style ?? null;
    if (!a || !b) continue;
    for (const field of STYLE_FIELDS) {
      if (a[field] !== b[field]) {
        diffs.push({ key, field, chrome: a[field], other: b[field] });
      }
    }
  }
  return diffs;
}

export function formatReport(checks: Check[], diffs: Diff[] | null): string {
  const lines = checks.map(
    (c) => `${c.pass ? 'PASS' : 'FAIL'}  ${c.name.padEnd(36)} ${c.detail}`
  );
  if (diffs === null) {
    lines.push('', 'DIFF  (no --tv file given: exact values are in the JSON)');
  } else if (diffs.length === 0) {
    lines.push('', 'DIFF  none: Chrome matches the TV snapshot');
  } else {
    lines.push('');
    for (const d of diffs) {
      lines.push(
        `DIFF  ${`${d.key}.${d.field}`.padEnd(36)} chrome=${d.chrome} | tv=${d.other}`
      );
    }
  }
  const failed = checks.filter((c) => !c.pass).length;
  lines.push(
    '',
    failed === 0
      ? 'All hard invariants passed.'
      : `${failed} hard invariant(s) failed.`
  );
  return lines.join('\n');
}

// --- In-page probe ----------------------------------------------------------

const PROBE_FN = `(selectors) => {
  const styleOf = (el) => {
    const cs = getComputedStyle(el);
    return {
      backgroundColor: cs.backgroundColor,
      backgroundImage: cs.backgroundImage,
      backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
      borderRadius: cs.borderRadius,
      opacity: cs.opacity,
      color: cs.color,
      boxShadow: cs.boxShadow
    };
  };
  const entries = {};
  let nowPlaying = null;
  for (const [key, candidates] of Object.entries(selectors)) {
    entries[key] = { selector: null, style: null };
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (!el) continue;
      entries[key] = { selector: sel, style: styleOf(el) };
      if (key === 'nowPlaying') nowPlaying = el;
      break;
    }
  }
  let tileImageUrl = null;
  const tile = nowPlaying && (nowPlaying.closest('ytlr-tile-renderer') || nowPlaying.parentElement);
  if (tile) {
    const img = tile.querySelector('img[src]');
    if (img) tileImageUrl = img.currentSrc || img.src;
    else {
      for (const el of tile.querySelectorAll('*')) {
        const m = /url\\(["']?([^"')]+)/.exec(getComputedStyle(el).backgroundImage);
        if (m) { tileImageUrl = m[1]; break; }
      }
    }
  }
  return { appPresent: !!document.querySelector('ytlr-app'), entries, tileImageUrl };
}`;

// --- Chrome launch and CDP driving ------------------------------------------

function findChrome(explicit?: string): string {
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new HarnessError(`Chrome not found at ${explicit}`);
    }
    return explicit;
  }
  const roots = [
    process.env['PROGRAMFILES'],
    process.env['PROGRAMFILES(X86)'],
    process.env['LOCALAPPDATA']
  ].filter((r): r is string => Boolean(r));
  const candidates = [
    ...roots.map((r) =>
      join(r, 'Google', 'Chrome', 'Application', 'chrome.exe')
    ),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    throw new HarnessError('Chrome not found. Pass --chrome <path>.');
  }
  return found;
}

async function portAnswers(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

function launchChrome(opts: {
  chrome: string;
  port: number;
  profile: string;
  url: string;
  /** Omit to keep Chrome's own desktop UA (Google sign-in rejects Leanback). */
  userAgent?: string;
}): ChildProcess {
  const args = [
    `--remote-debugging-port=${opts.port}`,
    `--user-data-dir=${opts.profile}`,
    ...(opts.userAgent ? [`--user-agent=${opts.userAgent}`] : []),
    `--app=${opts.url}`,
    `--window-size=${activeViewport.width},${activeViewport.height}`,
    '--window-position=0,0',
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=UserAgentClientHint'
  ];
  return spawn(opts.chrome, args, { stdio: 'ignore' });
}

/* eslint-disable no-await-in-loop -- polling and ordered key events */
export async function waitFor(
  what: string,
  timeoutMs: number,
  poll: () => Promise<boolean>,
  onWait?: () => void
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastNote = 0;
  while (Date.now() < deadline) {
    if (await poll()) return;
    if (onWait && Date.now() - lastNote > 10_000) {
      lastNote = Date.now();
      onWait();
    }
    await sleep(500);
  }
  throw new HarnessError(`timed out waiting for ${what}`);
}

async function pressKey(
  session: Session,
  key: string,
  code: number
): Promise<void> {
  for (const type of ['keyDown', 'keyUp']) {
    await session.send('Input.dispatchKeyEvent', {
      type,
      key,
      code: key,
      windowsVirtualKeyCode: code,
      nativeVirtualKeyCode: code
    });
  }
}

/* eslint-enable no-await-in-loop */

async function connectWithRetry(port: number, timeoutMs: number) {
  let session: Session | undefined;
  await waitFor('Chrome DevTools', timeoutMs, async () => {
    try {
      session = await connectToPort(port);
      return true;
    } catch {
      return false;
    }
  });
  return session as Session;
}

async function ensureTvLayout(
  session: Session,
  timeoutMs: number
): Promise<void> {
  const appUp = () =>
    session.evaluate(
      "!!document.querySelector('ytlr-app')"
    ) as Promise<boolean>;
  const notice = () =>
    console.log(
      'waiting for ytlr-app. If an account chooser is showing, pick the account by hand (or run with --login).'
    );
  try {
    await waitFor('ytlr-app', Math.min(timeoutMs, 30_000), appUp, notice);
    return;
  } catch {
    // Fall through to the user-agent override retry.
  }
  await session.send('Network.enable');
  await session.send('Network.setUserAgentOverride', { userAgent: activeUA });
  await session.send('Page.reload');
  try {
    await waitFor('ytlr-app', timeoutMs, appUp, notice);
  } catch {
    const info = await session.evaluate(
      '({ href: location.href, ua: navigator.userAgent, bodyClass: document.body.className })'
    );
    throw new HarnessError(
      `the TV layout (ytlr-app) never loaded: ${JSON.stringify(info)}`
    );
  }
}

function cropClip(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const pad = 24;
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  return {
    x,
    y,
    width: Math.min(1920 - x, rect.width + pad * 2),
    height: Math.min(1080 - y, rect.height + pad * 2),
    scale: 1
  };
}

/** Read the probed styles from the page the session is attached to. */
export function collectSnapshot(session: Session): Promise<Snapshot> {
  return session.callFunction(
    `function (selectors) { return (${PROBE_FN})(selectors); }`,
    PROBE_SELECTORS
  ) as Promise<Snapshot>;
}

const CONTROLS_SHOWN = `(() => {
  const c = document.querySelector('ytlr-player-actions-container');
  return !!c && !c.classList.contains('zylon-hidden') && c.childElementCount > 0;
})()`;

/** Wake the player controls with trusted keys until they are actually shown. */
export async function showControls(
  session: Session,
  timeoutMs: number,
  press: (key: string, code: number) => Promise<void>
): Promise<void> {
  await waitFor('the control bar', timeoutMs, async () => {
    if ((await session.evaluate(CONTROLS_SHOWN)) as boolean) return true;
    // ArrowDown is harmless on the player and wakes the controls.
    await press('ArrowDown', 40);
    return false;
  });
}

export interface Frame {
  requestedS: number;
  currentTime: number | null;
  paused: boolean | null;
}

/** Seek the player to `seconds` and pause, so the probed frame is repeatable. */
export async function seekAndPause(
  session: Session,
  seconds: number,
  timeoutMs: number
): Promise<Frame> {
  // Seeking before playback has really started gets undone by the app's own
  // source setup, so wait for decoded data and a moving clock first.
  await waitFor(
    'a playing <video>',
    timeoutMs,
    async () =>
      (await session.evaluate(
        "(() => { const v = document.querySelector('video'); return !!v && v.readyState >= 3 && v.currentTime > 0 && Number.isFinite(v.duration); })()"
      )) as boolean
  );
  let state: { currentTime: number; paused: boolean } | null = null;
  /* eslint-disable no-await-in-loop -- each attempt depends on the last */
  for (let attempt = 0; attempt < 3; attempt++) {
    await session.callFunction(
      `function (t) {
        const v = document.querySelector('video');
        v.currentTime = t;
        // The prototype method: the app's keep-playing hook swallows an
        // instance pause() that arrives while the user looks idle.
        HTMLMediaElement.prototype.pause.call(v);
        return new Promise((resolve) => {
          v.addEventListener('seeked', () => resolve(true), { once: true });
          setTimeout(() => resolve(false), 5000);
        });
      }`,
      seconds
    );
    await sleep(800);
    state = (await session.evaluate(
      "(() => { const v = document.querySelector('video'); return v && { currentTime: v.currentTime, paused: v.paused }; })()"
    )) as { currentTime: number; paused: boolean } | null;
    if (state && state.paused && Math.abs(state.currentTime - seconds) <= 2) {
      break;
    }
  }
  /* eslint-enable no-await-in-loop */
  const frame: Frame = {
    requestedS: seconds,
    currentTime: state?.currentTime ?? null,
    paused: state?.paused ?? null
  };
  if (
    frame.currentTime === null ||
    Math.abs(frame.currentTime - seconds) > 2 ||
    frame.paused !== true
  ) {
    console.warn(
      `warning: could not hold the player at ${seconds}s (${JSON.stringify(frame)}); frames will not align.`
    );
  }
  return frame;
}

async function probe(
  session: Session,
  opts: {
    watch: string;
    timeoutMs: number;
    out: string;
    timeS: number;
  }
): Promise<{ snapshot: Snapshot; info: Record<string, unknown> }> {
  await session.send('Page.bringToFront');
  await session.send('Emulation.setDeviceMetricsOverride', {
    ...activeViewport,
    deviceScaleFactor: 1,
    mobile: false
  });
  await ensureTvLayout(session, opts.timeoutMs);

  await session.send('Page.navigate', { url: opts.watch });
  await sleep(1500);
  await ensureTvLayout(session, opts.timeoutMs);

  const started = Date.now();
  const frame = await seekAndPause(session, opts.timeS, opts.timeoutMs);
  try {
    await showControls(session, opts.timeoutMs, (key, code) =>
      pressKey(session, key, code)
    );
  } catch (err) {
    const state = await session.evaluate(
      "({ href: location.href, active: document.activeElement && (document.activeElement.tagName + '.' + document.activeElement.className) })"
    );
    throw new HarnessError(
      `${err instanceof Error ? err.message : String(err)}; state: ${JSON.stringify(state)}`
    );
  }
  const barMs = Date.now() - started;
  await sleep(800);

  const snapshot = await collectSnapshot(session);

  const shot = (await session.send('Page.captureScreenshot', {
    format: 'png'
  })) as { data: string };
  await writeFile(join(opts.out, 'chrome-official.png'), shot.data, 'base64');
  const rect = (await session.evaluate(
    "(() => { const r = document.querySelector('ytlr-player-actions-container')?.getBoundingClientRect(); return r && { x: r.x, y: r.y, width: r.width, height: r.height }; })()"
  )) as { x: number; y: number; width: number; height: number } | null;
  if (rect) {
    const crop = (await session.send('Page.captureScreenshot', {
      format: 'png',
      clip: cropClip(rect)
    })) as { data: string };
    await writeFile(
      join(opts.out, 'chrome-official-bar.png'),
      crop.data,
      'base64'
    );
  }

  return {
    snapshot,
    info: {
      controlBarAppearedMs: barMs,
      frame,
      note: 'Chrome timing is informational; the on-TV p95 gate is authoritative.'
    }
  };
}

/** Fail with a snippet when the key selectors no longer match. */
async function assertSelectors(
  session: Session,
  snap: Snapshot
): Promise<void> {
  const critical: ProbeKey[] = ['bar', 'pill', 'leftButtons'];
  const missing = critical.filter((k) => snap.entries[k].selector === null);
  if (missing.length === 0) return;
  const snippet = (await session.evaluate(
    "(document.querySelector('ytlr-player-actions-container')?.outerHTML ?? '(container missing)').slice(0, 1500)"
  )) as string;
  throw new HarnessError(
    `selectors drifted: no match for ${missing.join(', ')}.\n${snippet}`
  );
}

const HELP = `usage: node tools/compare/compare-chrome.ts [options]
  --port <n>       DevTools port (default ${DEFAULT_PORT})
  --chrome <path>  Chrome executable (auto-detected otherwise)
  --profile <dir>  dedicated profile (default %LOCALAPPDATA%\\ytx-chrome-tv-profile)
  --url <url>      start URL (default ${DEFAULT_URL})
  --watch <url>    watch URL to probe (default: the Rick Astley mix)
  --time <sec>     seek to this second and pause before probing (default ${DEFAULT_TIME_S})
  --out <dir>      output dir (default %TEMP%\\ytx-chrome-compare)
  --tv <file>      optional TV snapshot JSON to report soft DIFFs against
  --attach         attach to Chrome already listening on --port
  --login          open the profile with the desktop UA to sign in, then wait for you to close it
  --ua <webos|cobalt>  user agent (default webos: the TV's own, so YouTube serves the same build; cobalt: PS4 reference build)
  --viewport <WxH> emulated viewport (default 1920x1080; use 1280x720 against the hd build)
  --eval <file>    evaluate this JS file in the probed page and print the result
  --keep-open      leave Chrome running after the probe
  --timeout <sec>  per-step timeout (default ${DEFAULT_TIMEOUT_S})
  --help`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: String(DEFAULT_PORT) },
      chrome: { type: 'string' },
      profile: { type: 'string' },
      url: { type: 'string', default: DEFAULT_URL },
      watch: { type: 'string', default: DEFAULT_WATCH },
      time: { type: 'string', default: String(DEFAULT_TIME_S) },
      out: { type: 'string' },
      tv: { type: 'string' },
      attach: { type: 'boolean', default: false },
      login: { type: 'boolean', default: false },
      ua: { type: 'string', default: 'webos' },
      eval: { type: 'string' },
      viewport: { type: 'string' },
      'keep-open': { type: 'boolean', default: false },
      timeout: { type: 'string', default: String(DEFAULT_TIMEOUT_S) },
      help: { type: 'boolean', default: false }
    }
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  if (values.ua !== 'webos' && values.ua !== 'cobalt') {
    throw new HarnessError('--ua must be webos or cobalt');
  }
  activeUA = USER_AGENTS[values.ua];
  if (values.viewport) {
    const m = /^(\d+)x(\d+)$/.exec(values.viewport);
    if (!m) throw new HarnessError('--viewport must look like 1280x720');
    activeViewport = { width: Number(m[1]), height: Number(m[2]) };
  }
  const port = Number(values.port);
  const timeoutMs = Number(values.timeout) * 1000;
  const timeS = Number(values.time);
  if (!Number.isInteger(port) || !(timeoutMs > 0)) {
    throw new HarnessError('--port and --timeout must be positive numbers');
  }
  if (!(timeS >= 0)) {
    throw new HarnessError('--time must be a number of seconds >= 0');
  }
  const profile =
    values.profile ??
    join(
      process.env['LOCALAPPDATA'] ?? join(homedir(), '.cache'),
      'ytx-chrome-tv-profile'
    );
  const out = values.out ?? join(tmpdir(), 'ytx-chrome-compare');
  const url = values.login ? LOGIN_URL : values.url;

  let child: ChildProcess | undefined;
  if (!values.attach) {
    if (await portAnswers(port)) {
      throw new HarnessError(
        `port ${port} already has a DevTools endpoint. Use --attach or pick another --port.`
      );
    }
    child = launchChrome({
      chrome: findChrome(values.chrome),
      port,
      profile,
      url,
      ...(values.login ? {} : { userAgent: activeUA })
    });
  } else if (!(await portAnswers(port))) {
    throw new HarnessError(`--attach: nothing is listening on port ${port}`);
  }

  if (values.login) {
    if (!child)
      throw new HarnessError('--login cannot be combined with --attach');
    console.log(
      'Sign in to YouTube TV and select the account, then close Chrome.\nProfile: ' +
        profile
    );
    await new Promise((resolve) => child.once('exit', resolve));
    return;
  }

  await mkdir(out, { recursive: true });
  let session: Session | undefined;
  try {
    session = await connectWithRetry(port, timeoutMs);
    const { snapshot, info } = await probe(session, {
      watch: values.watch,
      timeoutMs,
      out,
      timeS
    });
    await assertSelectors(session, snapshot);
    if (values.eval) {
      // Same page state as the probe (paused frame, bar up): for ad-hoc cascade inspection.
      const result = await session.evaluate(
        await readFile(values.eval, 'utf8')
      );
      console.log(JSON.stringify(result, null, 2));
    }

    const tvSnap = values.tv
      ? (JSON.parse(await readFile(values.tv, 'utf8')) as {
          snapshot?: Snapshot;
        } & Partial<Snapshot>)
      : null;
    const tv = tvSnap ? (tvSnap.snapshot ?? (tvSnap as Snapshot)) : null;
    const checks = evaluateInvariants(snapshot);
    const diffs = tv ? diffSnapshots(snapshot, tv) : null;
    await writeFile(
      join(out, 'chrome-official.json'),
      JSON.stringify(
        {
          uri: url,
          userAgent: activeUA,
          viewport: activeViewport,
          timeS,
          snapshot,
          checks,
          diffs,
          info
        },
        null,
        2
      )
    );
    console.log(formatReport(checks, diffs));
    console.log(`\nOutputs: ${out}`);
    if (checks.some((c) => !c.pass)) process.exitCode = 1;
  } finally {
    session?.close();
    if (child && !values['keep-open']) child.kill();
  }
}

if (import.meta.main) runCli(main);
