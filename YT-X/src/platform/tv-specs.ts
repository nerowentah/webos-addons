/**
 * TV specification detection and UI scaling. See webos-caps.ts for the
 * graphics-plane / video-plane model this module relies on.
 */

import { getDeviceInfo, getLibVersion, hasLunaBridge } from './webos-device';
import {
  compareVersions,
  normalizeInternalVersion,
  tvVersionFor
} from './webos-caps';
import type { VersionScheme, WebOSVersion } from './webos-caps';
import type { WebOSDeviceInfo } from '../core/globals';
import {
  parsePanelType,
  resolvePanelCareMode as resolveCareMode,
  type PanelCareMode,
  type PanelType
} from './panel-type';

/**
 * The space the YouTube TV UI is authored against. Fixed at 1920x1080 even on
 * the 720p package (both surfaces lay out in vh and shrink together); deriving
 * it from the canvas would make the calibration divide a ratio by itself.
 */
const DESIGN_HEIGHT = 1080;

const DESIGN_FONT_SIZE = 16;

type PanelClass = 'sd' | 'fhd' | 'uhd' | '8k' | 'unknown';

type PlaybackSource = 'deviceInfo' | 'screen' | 'unknown';

interface TVSpecs {
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
    } catch {
      // A throwing listener must not break the rest of the update.
    }
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

/** The care mode for this TV: the stored choice, else the detected panel. */
export function resolvePanelCareMode(
  stored: PanelCareMode,
  panel: PanelType = parsePanelType(
    currentSpecs?.model,
    currentSpecs?.panelOled
  )
): 'oled' | 'qned' | 'off' {
  return resolveCareMode(stored, panel);
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

  // Deliberately asymmetric: an unknown version reads as oldest here, because
  // blocking phone-to-TV casting on a set with no problem is worse than
  // missing the block on a 2025 firmware.
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

  if (info === null) return;

  deviceInfo = info;
  update();
}

/* -------------------------------------------------------- startup --- */

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
