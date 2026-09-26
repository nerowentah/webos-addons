/**
 * TV specification detection and UI scaling.
 *
 * The app and its userScript run inside the webOS webview, which on webOS 3.x
 * is a Chrome 38 engine with no viewport meta tag, so CSS pixels equal the
 * panel's native output resolution (1920x1080 on FHD sets, 3840x2160 on 4K).
 *
 * This module reads the specifications the webview actually exposes, derives a
 * stable UI scale (surfaced to the site UI and the options panel), and tags
 * <html> with a tier class (ytaf-tier-hd|fhd|qhd|uhd) that survives the site's
 * <body> class rewrites.
 */

export type ScreenTier = 'hd' | 'fhd' | 'qhd' | 'uhd';

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

export interface TVSpecs {
  /** window.screen resolution (0 when unavailable). */
  screenWidth: number;
  screenHeight: number;
  /** Layout viewport resolution in CSS px. */
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  /** screen resolution scaled by devicePixelRatio. */
  effectiveWidth: number;
  effectiveHeight: number;
  /** min(viewport/design, 1) snapped to classic display scales. */
  renderScale: number;
  tier: ScreenTier;
  model?: string;
  firmware?: string;
  platformVersion?: string;
}

const TIER_CLASSES: readonly ScreenTier[] = ['hd', 'fhd', 'qhd', 'uhd'];

const DESIGN_FONT_SIZE = 16;

/** UA tail substituted by webOS appinfo vendorExtension (see appinfo.json). */
const UA = typeof navigator !== 'undefined' ? (navigator.userAgent ?? '') : '';

function snapRenderScale(scale: number): number {
  if (!isFinite(scale) || scale <= 0) return 1;
  if (scale >= 1.7) return 2;
  if (scale >= 1.2) return 1.5;
  if (scale >= 0.94) return 1;
  // Sub-1080p panels (e.g. 1366x768) keep their true ratio rather than a snap.
  return Math.max(scale, 0.5);
}

function detectTier(effectiveHeight: number): ScreenTier {
  if (effectiveHeight <= 720) return 'hd';
  if (effectiveHeight <= 1080) return 'fhd';
  if (effectiveHeight <= 1440) return 'qhd';
  return 'uhd';
}

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

function parsePlatformVersion(ua: string): string | undefined {
  const match = /webOS-([0-9.]+)/i.exec(ua);
  return match?.[1];
}

/**
 * Dotted numeric version compare. Non-numeric segments are treated as 0 so a
 * malformed value degrades gracefully instead of throwing.
 */
function compareVersions(a: string, b: string): number {
  const aParts = a.split('.');
  const bParts = b.split('.');
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const aN = Number(aParts[i]) || 0;
    const bN = Number(bParts[i]) || 0;
    if (aN !== bN) return aN - bN;
  }
  return 0;
}

/**
 * webOS 2025 firmwares ship a built-in Google Cast ("cast core") service whose
 * Chromecast overlay conflicts with the app (freeze: webosbrew/youtube-webos,
 * issue #343; firmware 33.21.85 / platform 10.2.0). The mobile-app "push video"
 * bind (fetch('/wake_cast_core')) is safe on the older firmware lines, so the
 * cast-core block is only applied on the conflicting ones.
 */
export function hasCastCoreConflict(): boolean {
  const { firmware, platformVersion } = computeSpecs();
  if (firmware !== undefined && compareVersions(firmware, '33') >= 0)
    return true;
  if (
    platformVersion !== undefined &&
    compareVersions(platformVersion, '10') >= 0
  )
    return true;
  return false;
}

function computeSpecs(): TVSpecs {
  const cssWidth = window.innerWidth || 0;
  const cssHeight = window.innerHeight || 0;
  const screenWidthRaw = window.screen ? window.screen.width : 0;
  const screenHeightRaw = window.screen ? window.screen.height : 0;

  // The webview may report the window at a fraction of the native output (e.g.
  // a 1080p design surface on a 4K set). Take the larger of the two sources.
  const screenWidth = Math.max(screenWidthRaw, cssWidth);
  const screenHeight = Math.max(screenHeightRaw, cssHeight);
  const dpr = window.devicePixelRatio || 1;
  const effectiveWidth = Math.round(screenWidth * dpr);
  const effectiveHeight = Math.round(screenHeight * dpr);
  const renderScale = snapRenderScale(
    Math.min(cssWidth / DESIGN_WIDTH, cssHeight / DESIGN_HEIGHT)
  );

  const model = parseModel(UA);
  const firmware = parseFirmware(UA);
  const platformVersion = parsePlatformVersion(UA);

  const specs: TVSpecs = {
    screenWidth,
    screenHeight,
    cssWidth,
    cssHeight,
    devicePixelRatio: dpr,
    effectiveWidth,
    effectiveHeight,
    renderScale,
    tier: detectTier(effectiveHeight),
    ...(model !== undefined ? { model } : {}),
    ...(firmware !== undefined ? { firmware } : {}),
    ...(platformVersion !== undefined ? { platformVersion } : {})
  };

  return specs;
}

function applyToDocument(specs: TVSpecs) {
  const root = document.documentElement;
  if (!root) return;

  for (const tier of TIER_CLASSES) {
    root.classList.toggle(`ytaf-tier-${tier}`, tier === specs.tier);
  }

  // --ytaf-ui-scale is the shared knob: ui.js overrides the base value with the
  // site-calibrated value for the options panel.
  root.style.setProperty('--ytaf-ui-scale', String(specs.renderScale));
}

let currentSpecs: TVSpecs;

function update() {
  currentSpecs = computeSpecs();
  applyToDocument(currentSpecs);

  for (const listener of changeListeners) {
    try {
      listener();
    } catch (err) {
      console.warn('[tv-specs] change listener threw', err);
    }
  }

  if (window.__ytaf_debug__) {
    console.debug('[tv-specs]', currentSpecs);
  }
}

const changeListeners = new Set<() => void>();

export function addTVSpecsChangeListener(listener: () => void): void {
  changeListeners.add(listener);
}

/**
 * A UI scale that tracks the site's own zoom, so the options panel matches the
 * density of the YouTube UI it renders beside. Pure viewport scaling (vh) is
 * already resolution-aware; this only adjusts for cases where the site renders
 * at a zoom level (e.g. a YouTube TV zoom setting) that differs from the panel
 * viewport ratio.
 */
export function computeCalibratedScale(): number {
  const specs = currentSpecs;
  const expectedZoom = Math.min(
    Math.max(specs.effectiveHeight / DESIGN_HEIGHT, 1),
    2.5
  );

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

  siteZoom = Math.min(Math.max(siteZoom, 0.5), 3);
  return Math.min(
    Math.max((specs.renderScale * siteZoom) / expectedZoom, 0.5),
    3
  );
}

let resizeToken: number | undefined;

window.addEventListener('resize', () => {
  if (resizeToken !== undefined) window.clearTimeout(resizeToken);
  resizeToken = window.setTimeout(update, 150);
});

window.addEventListener('orientationchange', update);

update();
