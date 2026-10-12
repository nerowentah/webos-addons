/**
 * TV specification detection and UI scaling.
 *
 * webOS renders this app on two independent planes, and the distinction is the
 * whole point of this module:
 *
 *   Graphics plane ("UI plane" upstream). A fixed canvas, declared by the
 *   `resolution` property in appinfo.json and only ever 1920x1080 or 1280x720 -
 *   webOS TV does not offer UHD graphics to web apps. This is what CSS lays out
 *   in, so it is read from `window.innerWidth` / `window.innerHeight`. The TV's
 *   scaler upscales it to the panel afterwards, in hardware, which means no
 *   amount of CSS can observe the panel's real size.
 *
 *   Video plane. The panel's actual output resolution - 3840x2160 on a UHD set,
 *   1920x1080 on an FHD one. Reachable only through `webOS.deviceInfo()`, and
 *   the only place "native resolution" means anything the app can act on.
 *
 * Because the graphics canvas is fixed, this module does not scale the UI to
 * the panel. It cannot: the panel is not in the CSS coordinate space. What it
 * does instead is keep the app's density matched to the YouTube TV UI it renders
 * beside, and hand the real panel resolution to the playback code that can use
 * it.
 *
 * The old version of this file assumed CSS pixels equalled the panel's output
 * resolution and divided the UI scale by `screenHeight / 1080`. That is a panel
 * quantity dividing a CSS quantity, and it halved the options panel on every
 * UHD set. See computeCalibratedScale().
 *
 * @see https://webostv.developer.lge.com/develop/specifications/app-resolution
 */

import { getDeviceInfo, getLibVersion, hasLunaBridge } from './webos-device';
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
 * The space the YouTube TV UI is authored against, and so the space this app's
 * vh-based layout is calibrated to.
 *
 * Fixed at 1920x1080 on purpose, including on the 1280x720 package. That
 * package gets a smaller canvas, but both this app and the site lay out in vh,
 * so both shrink by the same factor automatically and still match each other.
 * Re-deriving a "design space" from the canvas would make the calibration below
 * divide a viewport ratio by itself.
 */
export const DESIGN_HEIGHT = 1080;

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
  /**
   * min(viewportRatio, 1), for diagnostics only.
   *
   * This used to drive --ytx-ui-scale through a ladder of "classic display
   * scales". The ladder was fiction: the canvas cannot exceed 1920x1080, so the
   * 1.5 and 2 rungs were unreachable and the 720p package landed on an
   * unsnapped 0.667. Nothing consumes it but the debug dump now.
   */
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
   * Platform-stated panel properties.
   *
   * `undefined` means the platform did not report the property, which is not
   * the same as `false`: `oled` is optional upstream and is absent on older
   * webOS. Callers have to tell those apart.
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
 * An optional platform flag, with `undefined` preserved.
 *
 * deviceInfo marks these properties `Optional*` upstream - "on the previous
 * version of webOS TV that does not support this property, return undefined" -
 * so an absent property has to survive as undefined rather than collapsing to
 * false, which would read as "the platform says no" instead of "the platform
 * did not say".
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
 * What the platform reported, once it has answered.
 *
 * Held here rather than merged into the published specs, because update() builds
 * the specs from scratch on every notification. A one-shot merge would be thrown
 * away by the next resize - and the async enrichment exists precisely to fire
 * one.
 */
let deviceInfo: WebOSDeviceInfo | null = null;

/**
 * Everything the current environment can tell us.
 *
 * Synchronous on purpose. The graphics canvas and the UA are both available at
 * module-evaluation time, which is what lets block-webos-cast.ts take its
 * decision then. The video plane joins later, from webos-device.ts, by way of
 * the module-level deviceInfo above.
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

  // The video plane. deviceInfo is the only real source. window.screen is
  // undocumented on webOS and is not the same quantity, so it is a fallback for
  // when the platform API is unavailable - deliberately never a max() against
  // the canvas, since blending the two planes is what fed a 4K number into the
  // UI scale in the first place.
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
    // deviceInfo wins over the UA: it is the platform answering directly, while
    // the UA is webOS echoing a string the app itself put in appinfo.json.
    ...(deviceModel !== undefined ? { model: deviceModel } : {}),
    ...(sdkVersion !== undefined ? { sdkVersion } : {}),
    ...(libVersion !== undefined ? { libVersion } : {})
  };
}

function applyToDocument() {
  const root = document.documentElement;
  if (!root) return;

  // --ytx-ui-scale is the single density knob. It is written here rather than
  // by the options panel so that every consumer - ui.css and anything added
  // later - reads the same value from one place.
  root.style.setProperty('--ytx-ui-scale', String(computeCalibratedScale()));
}

let currentSpecs: TVSpecs | undefined;

/**
 * The live specs.
 *
 * Defined from module evaluation, so it is only ever absent if computeSpecs()
 * threw - in which case the guards below keep the app on its defaults rather
 * than propagating the failure into the UI.
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
 * A density that tracks the site's own zoom, so the options panel matches the
 * density of the YouTube UI it renders beside.
 *
 * The site, like this app, lays out in vh and rem, so on a 1280x720 canvas it
 * scales its root font down by exactly the canvas ratio. That ratio is the
 * viewport's business, not ours: both surfaces already track it, which is why
 * this returns 1.0 on either package.
 *
 * So the raw root-font ratio is divided by the viewport ratio, which cancels
 * the part the viewport explains and leaves only zoom the site applied on top
 * of it. That residue is the one thing worth acting on.
 *
 * The previous implementation multiplied in a `renderScale` derived from the
 * canvas and then divided by `screenHeight / 1080`. On a 1920x1080 canvas that
 * was 1 / 2; on 1280x720 it was 0.667 x 0.667. Both floored to 0.5, halving the
 * panel on every set, for two different reasons.
 */
export function computeCalibratedScale(): number {
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
 * Re-apply the calibrated scale.
 *
 * Exported for callers that know something the startup path does not - chiefly
 * the options panel, which runs inside the site page once its stylesheets have
 * been applied. Measuring site zoom needs those stylesheets, and the first
 * measurement in the app shell necessarily happens against an unstyled
 * document.
 */
export function refreshUIScale(): void {
  applyToDocument();
}

/* ------------------------------------------------------------ panel type --- */

/**
 * Panel type, from the platform where it will say, and the model string where
 * it will not.
 *
 * The webview has no luna bridge to ask the TV what panel it is, and webOS
 * substitutes $modelName$ into the UA at app launch (see appinfo.json).
 */
export type PanelType = 'oled' | 'qned' | 'lcd' | 'unknown';

/**
 * Letter groups that follow a size in an LG part number, e.g. the "C1" in
 * "OLED55C14PUA" or the "ASA" in "65QNED86ASA".
 */
const LG_FAMILY_TOKENS = /\d([A-Z]+)\d*/g;

/**
 * Family codes LG uses for its OLED panels.
 *
 * Only consulted when `deviceInfo().oled` is undefined, which upstream defines
 * as "a webOS version that does not support this property". A set whose part
 * number starts with one of these letters but is not OLED can be misread, so
 * this is a fallback, never the primary answer.
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
  const head = model?.toUpperCase();

  // QNED and MiniLED are not exposed by the platform at all, so the model
  // string is the only source for them. Checked before the platform flag
  // because a QNED part number can also carry an OLED-like family group.
  if (
    head !== undefined &&
    (head.includes('QNED') || head.includes('MINILED'))
  ) {
    return 'qned';
  }

  // The platform states OLED outright, and knows better than a part-number
  // pattern ever could. An explicit `false` is authoritative too: it means LCD,
  // and skips the guesswork below entirely.
  if (oledFromPlatform !== undefined) {
    return oledFromPlatform ? 'oled' : 'lcd';
  }

  // Undefined: an older webOS without the optional property. Guess from the
  // model. "55NANO8PUA" lands here and correctly misses - its family group
  // starts with N.
  if (head !== undefined) {
    if (head.includes('OLED')) return 'oled';
    if (matchesOLEDFamilyCode(head)) return 'oled';
  }

  return 'lcd';
}

/**
 * The panel care mode this TV should actually use.
 *
 * 'auto' maps the detected panel to a care mode; an explicit stored choice
 * always wins. A panel this function cannot classify resolves to 'off', which
 * is the safe direction: it leaves the UI exactly as it was before any of this
 * existed, rather than applying a treatment tuned for the wrong panel.
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
 * webOS 2025 firmwares ship a built-in Google Cast ("cast core") service whose
 * Chromecast overlay conflicts with the app (freeze: webosbrew/youtube-webos,
 * issue #343; firmware 33.21.85 / platform 10.2.0). The mobile-app "push video"
 * bind (fetch('/wake_cast_core')) is safe on the older firmware lines, so the
 * cast-core block is only applied on the conflicting ones.
 *
 * This is a behavioural gate, not a capability check - there is nothing to
 * feature-detect - so it stays on the synchronous UA path. block-webos-cast.ts
 * calls it while evaluating its module body, before any request can be issued.
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

  // Note the asymmetry with isVersionAtLeast(), which reads an unknown version
  // as the newest. Here an unknown version reads as the oldest, because the
  // failure modes are not symmetric: this flag is a workaround for a freeze, so
  // failing to parse a version and blocking anyway would switch off phone-to-TV
  // casting on a set that has no problem, which is worse than missing the block
  // on a 2025 firmware. 0 is below every threshold here by construction.
  return specs.internalVersion >= 10;
}

/* -------------------------------------------------------- async enrichment --- */

/**
 * Ask the platform for the video plane, once, then republish.
 *
 * The values describe fixed hardware, so there is nothing to watch for. The
 * republish matters anyway: update() re-measures the calibrated scale against a
 * document that by then carries the site's stylesheets, and notifies the panel
 * care listeners, which resolve 'auto' against modelName and oled.
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
 * The capability matrix, with a verdict per row against this device.
 *
 * The `expected` and `versionMet` columns are diagnostics, not gates: nothing
 * refuses a capability because the version looks too old, and an unrecognised
 * (newer) version reports `versionMet: true` so a future firmware never looks
 * like a missing feature. The verdict says what the app actually got.
 */
function capabilityReport() {
  const specs = currentSpecs;
  const fromPlatform = specs?.playbackSource === 'deviceInfo';

  const verdicts: Record<string, string> = {
    deviceInfo: window.webOS !== undefined ? 'available' : 'unavailable',
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

// The graphics canvas is the only thing a resize can change here, and it is
// the one thing that has to be tracked: it is what the UI is laid out in. The
// video plane cannot move - it is fixed panel hardware - so it is deliberately
// not re-probed, and the debounce exists only to coalesce the burst of resizes
// that follows an orientation change.
window.addEventListener('resize', () => {
  if (resizeToken !== undefined) window.clearTimeout(resizeToken);
  resizeToken = window.setTimeout(update, 150);
});

window.addEventListener('orientationchange', update);

update();

// The calibrated scale reads the site's computed root font size, which is
// meaningless until YouTube's stylesheets are applied. This module also runs in
// the app shell, before the redirect to the site, where the first measurement is
// taken against an unstyled document; re-measuring on DOMContentLoaded closes
// that gap for the userScript copy, which is the one that draws the panel.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => update(), { once: true });
}

void enrichFromDevice();
