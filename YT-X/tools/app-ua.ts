/**
 * The User-Agent webOS sends for the app, chosen at build time: webOS fills the
 * `$...$` variables of appinfo.json's `vendorExtension.userAgent` template with
 * this TV's values, and YouTube picks its CSS/JS build from the result before
 * any userscript runs, so it cannot be switched at runtime.
 */

/** The PS4 Cobalt build with the LG device tail, so the model still reaches YouTube. */
const COBALT_UA =
  'Mozilla/5.0 (PS4; Leanback Shell) Cobalt/24.lts.13.1032728-gold v8/8.8.278.8-jit gles Starboard/14, _TV_O18/$firmwareVersion$ (LG, $modelName$, $networkMode$)';

/** `cobalt` replaces the template in assets/appinfo.json; `webos` keeps it. */
const UA_MODES = ['cobalt', 'webos'] as const;
export type UaMode = (typeof UA_MODES)[number];
const DEFAULT_UA_MODE: UaMode = 'webos';

export function resolveUaMode(requested: string | undefined): UaMode {
  if (requested === undefined) return DEFAULT_UA_MODE;
  const mode = UA_MODES.find((m) => m === requested);
  if (!mode) {
    throw new Error(
      `--ua must be one of ${UA_MODES.join(', ')}; got ${requested}`
    );
  }
  return mode;
}

/** Sets the UA template for `mode` on a parsed appinfo.json; `webos` leaves it untouched. */
export function applyUserAgent(
  appInfo: Record<string, unknown>,
  mode: UaMode
): void {
  if (mode === 'webos') return;
  const ext = appInfo['vendorExtension'];
  if (typeof ext !== 'object' || ext === null || Array.isArray(ext)) {
    throw new Error('appinfo.json has no vendorExtension object');
  }
  (ext as Record<string, unknown>)['userAgent'] = COBALT_UA;
}
