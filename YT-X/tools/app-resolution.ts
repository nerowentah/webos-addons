/**
 * The graphics canvas the app declares in appinfo.json. webOS accepts only two
 * values, and the canvas is fixed at build time: webpack picks it via
 * `--env resolution=` and the deploy tool via `--resolution`, so both resolve
 * through this module.
 *
 * Scripts pass the symbolic name (`fhd` / `hd`); the pixel values are accepted
 * too, because that is what appinfo.json itself must contain.
 *
 * @see https://webostv.developer.lge.com/develop/specifications/app-resolution
 */

export const APP_RESOLUTION_ALIASES = {
  fhd: '1920x1080',
  hd: '1280x720'
} as const;

export type AppResolution =
  (typeof APP_RESOLUTION_ALIASES)[keyof typeof APP_RESOLUTION_ALIASES];

export const DEFAULT_RESOLUTION: AppResolution = APP_RESOLUTION_ALIASES.fhd;

const ACCEPTED = [
  ...Object.keys(APP_RESOLUTION_ALIASES),
  ...Object.values(APP_RESOLUTION_ALIASES)
];

/**
 * Normalises a requested canvas to the pixel value appinfo.json requires.
 * `undefined` means "not requested" and selects the default.
 */
export function resolveAppResolution(
  requested: string | undefined
): AppResolution {
  if (requested === undefined) return DEFAULT_RESOLUTION;

  const alias = Object.entries(APP_RESOLUTION_ALIASES).find(
    ([name]) => name === requested
  );
  if (alias) return alias[1];

  const pixel = Object.values(APP_RESOLUTION_ALIASES).find(
    (value) => value === requested
  );
  if (pixel) return pixel;

  throw new Error(
    `resolution must be one of ${ACCEPTED.join(', ')}; got ${requested}`
  );
}
