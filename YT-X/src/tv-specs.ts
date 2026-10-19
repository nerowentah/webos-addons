/**
 * TV specification detection and UI scaling. See webos-caps.ts for the
 * graphics-plane / video-plane model this module relies on.
 */

import {
  getDeviceInfo,
  getLibVersion,
  hasLunaBridge,
  hasWebOS
} from './webos-device';
import {
  CAPABILITIES,
  compareVersions,
  isVersionAtLeast,
  normalizeInternalVersion,
  tvVersionFor
} from './webos-caps';
import type { VersionScheme, WebOSVersion } from './webos-caps';
import type { WebOSDeviceInfo } from './globals';

/**
 * The space the YouTube TV UI is authored against. Fixed at 1920x1080 even on
 * the 720p package (both surfaces lay out in vh and shrink together); deriving
 * it from the canvas would make the calibration divide a ratio by itself.
 */
const DESIGN_HEIGHT = 1080;

const DESIGN_FONT_SIZE = 16;

export type PanelClass = 'sd' | 'fhd' | 'uhd' | '8k' | 'unknown';

export type PlaybackSource = 'deviceInfo' | 'screen' | 'unknown';

export interface TVSpecs {
  /** Graphics plane canvas, in CSS px. Authoritative. */
  graphicsWidth: number;
  graphicsHeight: number;

  /** Video plane, in panel pixels. 0 when the platform did not say. */
  playbackWidth: number;
  playbackHeight: number;
  /** Which of the two sources above playbackWidth/Height came from. */
  playbackSource: PlaybackSource;

  devicePixelRatio: number;

  /** graphicsHeight / DESIGN_HEIGHT. 1 on the 1920x1080 package, 0.667 on 1280x720. */
  viewportRatio: number;
  /** min(viewportRatio, 1); diagnostics only — it once drove --ytx-ui-scale. */
  renderScale: number;

  panelClass: PanelClass;

  model?: string;
  firmware?: string;
  /** Raw `$platformVersion$` from the app UA, for diagnostics. */
  platformVersion?: string;
  /** platformVersion normalised to webOS's own numbering; 0 when unparseable. */
  internalVersion: WebOSVersion;
  /** The TV/marketing version, when the internal one maps to a known release. */
  tvVersion?: number;
  versionScheme: VersionScheme;
  /** Internal webOS version from `deviceInfo().sdkVersion`, when available. */
  sdkVersion?: string;

  /**
   * Platform-stated panel properties. `undefined` means the platform did not
   * report — not the same as `false`; callers must tell them apart.
   */
  panelOled: boolean | undefined;
  panelUhd: boolean | undefined;
  panelUhd8K: boolean | undefined;

  libVersion?: string;
  lunaAvailable: boolean;
}

/** UA tail substituted by the webOS appinfo vendorExtension (see appinfo.json). */
const UA = typeof navigator !== 'undefined' ? (navigator.userAgent ?? '') : '';

function parseModel(ua: string): string | undefined {
  const start = ua.indexOf('(LG, ');
  if (start === -1) return undefined;
  const end = ua.indexOf(',', start + 5);
  if (end === -1) return undefined;
  const model = ua.slice(start + 5, end).trim();
  return model === '' ? undefined : model;
}

function parseFirmware(ua: string): string | undefined {
  const match = /_TV_O\d+\/([0-9.]+)/.exec(ua);
  return match?.[1];
}

function parseRawPlatformVersion(ua: string): string | undefined {
  const match = /webOS-([0-9.]+)/i.exec(ua);
  return match?.[1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * An optional platform flag, with `undefined` preserved: deviceInfo marks
 * these `Optional*`, and absent must not collapse to false ("says no").
 */
function readFlag(value: boolean | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** As readFlag, for the string properties. Empty counts as absent. */
function readText(value: string | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function detectPanelClass(
  playbackHeight: number,
  uhd: boolean | undefined,
  uhd8K: boolean | undefined
): PanelClass {
  if (uhd8K === true) return '8k';
  if (uhd === true) return 'uhd';
  if (playbackHeight >= 4320) return '8k';
  if (playbackHeight >= 2160) return 'uhd';
  if (playbackHeight >= 1080) return 'fhd';
  if (playbackHeight > 0) return 'sd';
  return 'unknown';
}

/**
 * What the platform reported, once it answered. Held separately because
 * update() rebuilds the specs from scratch on every notification.
 */
let deviceInfo: WebOSDeviceInfo | null = null;

/**
 * Everything the current environment can tell us. Synchronous on purpose: the
 * canvas and UA exist at module-evaluation time, which is what lets
 * block-webos-cast.ts decide then.
 */
function computeSpecs(): TVSpecs {
  const graphicsWidth = window.innerWidth || 0;
  const graphicsHeight = window.innerHeight || 0;

  const model = parseModel(UA);
  const firmware = parseFirmware(UA);
  const platformVersion = parseRawPlatformVersion(UA);
  const { version: internalVersion, scheme: versionScheme } =
    normalizeInternalVersion(platformVersion);
  const tvVersion = tvVersionFor(internalVersion);
  const libVersion = getLibVersion();

  // The video plane: deviceInfo only. window.screen is undocumented on webOS,
  // a fallback for when the API is unavailable - never a max() against the
  // canvas, since blending the planes fed a 4K number into the UI scale.
  const info = deviceInfo;
  const platformPlayback =
    info !== undefined &&
    info !== null &&
    typeof info.screenWidth === 'number' &&
    typeof info.screenHeight === 'number' &&
    info.screenWidth > 0 &&
    info.screenHeight > 0;

  const playbackWidth = platformPlayback
    ? (info.screenWidth as number)
    : (window.screen?.width ?? 0);
  const playbackHeight = platformPlayback
    ? (info.screenHeight as number)
    : (window.screen?.height ?? 0);

  let playbackSource: PlaybackSource = 'unknown';
  if (platformPlayback) playbackSource = 'deviceInfo';
  else if (window.screen && window.screen.height > 0) playbackSource = 'screen';

  const viewportRatio = graphicsHeight > 0 ? graphicsHeight / DESIGN_HEIGHT : 1;

  const uhd = readFlag(info?.uhd);
  const uhd8K = readFlag(info?.uhd8K);
  const deviceModel = readText(info?.modelName);
  const sdkVersion = readText(info?.sdkVersion);

  return {
    graphicsWidth,
    graphicsHeight,
    playbackWidth,
    playbackHeight,
    playbackSource,
    devicePixelRatio: window.devicePixelRatio || 1,
    viewportRatio,
    renderScale: Math.min(viewportRatio, 1),
    panelClass: detectPanelClass(playbackHeight, uhd, uhd8K),
    internalVersion,
    versionScheme,
    panelOled: readFlag(info?.oled),
    panelUhd: uhd,
    panelUhd8K: uhd8K,
    lunaAvailable: hasLunaBridge(),
    ...(model !== undefined ? { model } : {}),
    ...(firmware !== undefined ? { firmware } : {}),
    ...(platformVersion !== undefined ? { platformVersion } : {}),
    ...(tvVersion !== undefined ? { tvVersion } : {}),
    // deviceInfo wins over the UA: the platform answering directly, vs a
    // string the app itself put in appinfo.json.
    ...(deviceModel !== undefined ? { model: deviceModel } : {}),
    ...(sdkVersion !== undefined ? { sdkVersion } : {}),
    ...(libVersion !== undefined ? { libVersion } : {})
  };
}

function applyToDocument() {
  const root = document.documentElement;
  if (!root) return;

  // --ytx-ui-scale is the single density knob, written here so every consumer
  // reads one value from one place.
  root.style.setProperty('--ytx-ui-scale', String(computeCalibratedScale()));
}

let currentSpecs: TVSpecs | undefined;

/**
 * The live specs; absent only if computeSpecs() threw, in which case callers
 * stay on their defaults.
 */
export function getTVSpecs(): TVSpecs | undefined {
  return currentSpecs;
}

function update() {
  currentSpecs = computeSpecs();
  applyToDocument();

  for (const listener of changeListeners) {
    try {
      listener();
    } catch (err) {
      console.warn('[tv-specs] change listener threw', err);
    }
  }

  if (window.__ytx_debug__) {
    console.debug('[tv-specs]', currentSpecs);
    console.debug('[tv-specs] capability matrix', capabilityReport());
  }
}

const changeListeners = new Set<() => void>();

export function addTVSpecsChangeListener(listener: () => void): void {
  changeListeners.add(listener);
}

/**
 * A density that tracks the site's own zoom: the raw root-font ratio divided by
 * the viewport ratio cancels the part the viewport explains (both surfaces lay
 * out in vh) and leaves only the site's own zoom — the one residue worth
 * acting on. A panel quantity must never divide this ratio again.
 */
function computeCalibratedScale(): number {
  const specs = currentSpecs;
  if (specs === undefined) return 1;

  const viewportRatio = specs.viewportRatio;
  if (!isFinite(viewportRatio) || viewportRatio <= 0) return 1;

  let siteZoom = 1;
  try {
    const rootFont = parseFloat(
      getComputedStyle(document.documentElement).fontSize
    );
    if (isFinite(rootFont) && rootFont > 0) {
      siteZoom = rootFont / DESIGN_FONT_SIZE;
    }
  } catch {
    // A throwing probe (or a missing documentElement) means "unknown": keep 1.
  }

  return clamp(siteZoom / viewportRatio, 0.75, 2);
}

/**
 * Re-apply the calibrated scale. Exported for callers that know something
 * startup does not — chiefly the options panel, which can only measure site
 * zoom after the site's stylesheets have applied.
 */
export function refreshUIScale(): void {
  applyToDocument();
}

/* ------------------------------------------------------------ panel type --- */

/**
 * Panel type, from the platform where it will say and the model string where
 * it will not (no luna bridge in the webview; $modelName$ is in the UA).
 */
export type PanelType = 'oled' | 'qned' | 'lcd' | 'unknown';

/** Groups after a size in an LG part number, e.g. the "C1" in "OLED55C14PUA". */
const LG_FAMILY_TOKENS = /\d([A-Z]+)\d*/g;

/**
 * LG OLED panel family codes. Only consulted when the platform flag is
 * undefined (older webOS); a non-OLED set with a matching part number can be
 * misread, so this is a fallback, never the primary answer.
 */
const OLED_FAMILY_PREFIXES = new Set([
  'A',
  'B',
  'C',
  'E',
  'G',
  'W',
  'CS',
  'CX',
  'EG',
  'EW',
  'GX',
  'WO'
]);

function matchesOLEDFamilyCode(head: string): boolean {
  LG_FAMILY_TOKENS.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LG_FAMILY_TOKENS.exec(head)) !== null) {
    const group = match[1] ?? '';
    if (
      OLED_FAMILY_PREFIXES.has(group.slice(0, 2)) ||
      OLED_FAMILY_PREFIXES.has(group.slice(0, 1))
    ) {
      return true;
    }
  }
  return false;
}

export function parsePanelType(
  model: string | undefined,
  oledFromPlatform: boolean | undefined
): PanelType {
  const headRaw = model?.toUpperCase();
  const head = headRaw?.replace(/[\s_-]+/g, '');

  // QNED/MiniLED are not exposed by the platform at all, and a QNED part
  // number can carry an OLED-like family group, so the model string is first.
  if (
    head !== undefined &&
    (head.includes('QNED') || head.includes('MINILED'))
  ) {
    return 'qned';
  }

  // The platform states OLED outright and knows better than any part-number
  // pattern; explicit `false` is authoritative too (it means LCD).
  if (oledFromPlatform !== undefined) {
    return oledFromPlatform ? 'oled' : 'lcd';
  }

  // Undefined: older webOS without the property; guess from the model
  // ("55NANO8PUA" lands here and correctly misses).
  if (head !== undefined) {
    if (head.includes('OLED')) return 'oled';
    if (matchesOLEDFamilyCode(head)) return 'oled';
  }

  return 'lcd';
}

/**
 * The panel care mode this TV should use: an explicit stored choice wins, else
 * 'auto' maps the detected panel; an unclassifiable panel resolves to 'off' —
 * the safe direction rather than a treatment tuned for the wrong panel.
 */
export function resolvePanelCareMode(
  stored: string,
  panel: PanelType = parsePanelType(
    currentSpecs?.model,
    currentSpecs?.panelOled
  )
): 'oled' | 'qned' | 'off' {
  if (stored === 'oled' || stored === 'qned' || stored === 'off') return stored;

  if (panel === 'oled') return 'oled';
  if (panel === 'qned') return 'qned';
  return 'off';
}

/**
 * Whether this firmware's built-in Google Cast ("cast core") overlay conflicts
 * with the app (webosbrew/youtube-webos #343; firmware 33.21.85 / platform
 * 10.2.0). A behavioural gate, not a capability check, so it stays on the
 * synchronous UA path; block-webos-cast.ts calls it at module evaluation.
 */
export function hasCastCoreConflict(): boolean {
  const specs = currentSpecs;
  if (specs === undefined) return false;

  if (
    specs.firmware !== undefined &&
    compareVersions(specs.firmware, '33') >= 0
  ) {
    return true;
  }

  // The asymmetry with isVersionAtLeast() is deliberate: an unknown version
  // reads as oldest here, because blocking phone-to-TV casting on a set with
  // no problem is worse than missing the block on a 2025 firmware.
  return specs.internalVersion >= 10;
}

/* -------------------------------------------------------- async enrichment --- */

/**
 * Ask the platform for the video plane, once, then republish: update() then
 * re-measures the calibrated scale (stylesheets now applied) and notifies the
 * panel-care listeners.
 */
async function enrichFromDevice(): Promise<void> {
  const info = await getDeviceInfo();

  if (info === null) {
    if (window.__ytx_debug__) {
      console.info(
        '[tv-specs] no deviceInfo; the video plane stays on the screen fallback'
      );
    }
    return;
  }

  deviceInfo = info;
  update();
}

/**
 * The capability matrix with a per-row verdict. `expected`/`versionMet` are
 * diagnostics, not gates; an unrecognised newer version reports
 * `versionMet: true` so future firmware never looks like a missing feature.
 */
function capabilityReport() {
  const specs = currentSpecs;
  const fromPlatform = specs?.playbackSource === 'deviceInfo';

  const verdicts: Record<string, string> = {
    deviceInfo: hasWebOS() ? 'available' : 'unavailable',
    playbackResolution: fromPlatform
      ? 'available (deviceInfo)'
      : `fallback (${specs?.playbackSource ?? 'unknown'})`,
    uhd:
      specs?.panelUhd !== undefined
        ? `available (${String(specs.panelUhd)})`
        : 'fallback (height inference)',
    uhd8K:
      specs?.panelUhd8K !== undefined
        ? `available (${String(specs.panelUhd8K)})`
        : 'fallback (false)',
    oled:
      specs?.panelOled !== undefined
        ? `available (${String(specs.panelOled)})`
        : 'fallback (model family code)',
    sdkVersion:
      specs?.sdkVersion !== undefined
        ? 'available (deviceInfo)'
        : 'fallback (UA platform version)',
    tuner: 'not consumed',
    appInfo: 'not needed (canvas read from innerWidth/innerHeight)',
    luna: hasLunaBridge() ? 'available' : 'unavailable'
  };

  return CAPABILITIES.map((cap) => ({
    id: cap.id,
    expected: `webOS internal >= ${cap.minInternalVersion}`,
    versionMet: isVersionAtLeast(
      specs?.internalVersion,
      cap.minInternalVersion
    ),
    verdict: verdicts[cap.id] ?? 'unknown',
    probe: cap.probe,
    consequence: cap.consequence
  }));
}

/* ---------------------------------------------------------------- startup --- */

let resizeToken: number | undefined;

// A resize can only change the graphics canvas, which the UI is laid out in.
// The video plane is fixed panel hardware and is deliberately not re-probed;
// the debounce only coalesces orientation-change resize bursts.
window.addEventListener('resize', () => {
  if (resizeToken !== undefined) window.clearTimeout(resizeToken);
  resizeToken = window.setTimeout(update, 150);
});

window.addEventListener('orientationchange', update);

update();

// The calibrated scale reads the site's computed root font, meaningless until
// YouTube's stylesheets apply; re-measuring on DOMContentLoaded closes that gap
// for the userScript copy, which is the one that draws the panel.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => update(), { once: true });
}

void enrichFromDevice();
