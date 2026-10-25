/**
 * The User-Agent webOS sends for the app, chosen at build time: webOS fills the
 * `$...$` variables of appinfo.json's `vendorExtension.userAgent` template with
 * this TV's values, and YouTube picks its CSS/JS build from the result before
 * any userscript runs, so it cannot be switched at runtime.
 */

/** The Cobalt build with the LG device tail, so the model still reaches YouTube. The platform slot mirrors the native build's patched strings (`Web0S; Linux`, `SmartTV`) rather than "PS4", which YouTube lists as a PlayStation 4. */
export const COBALT_UA =
  'Mozilla/5.0 (Web0S; Linux) Cobalt/24.lts.13.1032728-gold v8/8.8.278.8-jit gles Starboard/14, SmartTV_TV_O18/$firmwareVersion$ (LG, $modelName$, $networkMode$)';

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

/** The TV's own values, for builds whose UA must not rely on webOS filling the variables. */
export interface DeviceIdentity {
  modelName: string;
  firmwareVersion: string;
}

/**
 * Sets the UA template for `mode` on a parsed appinfo.json; `webos` leaves it untouched.
 * A sideloaded app gets generic values for `$modelName$` and `$firmwareVersion$`
 * ("webOS.TV", "00.00.01"), so `device` bakes the TV's real ones into the Cobalt UA.
 */
export function applyUserAgent(
  appInfo: Record<string, unknown>,
  mode: UaMode,
  device?: DeviceIdentity
): void {
  if (mode === 'webos') return;
  const ext = appInfo['vendorExtension'];
  if (typeof ext !== 'object' || ext === null || Array.isArray(ext)) {
    throw new Error('appinfo.json has no vendorExtension object');
  }
  (ext as Record<string, unknown>)['userAgent'] = device
    ? COBALT_UA.replace('$firmwareVersion$', device.firmwareVersion).replace(
        '$modelName$',
        device.modelName
      )
    : COBALT_UA;
}
