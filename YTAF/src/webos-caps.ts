/**
 * webOS version numbering and the capability matrix.
 *
 * webOS exposes two independent rendering planes, and almost every resolution
 * bug in this app came from treating them as one:
 *
 *   Graphics plane ("UI plane" upstream). Fixed by the `resolution` property in
 *   appinfo.json, and only ever 1920x1080 or 1280x720 - webOS TV does not
 *   support UHD graphics for web apps at all. This is the CSS pixel canvas, so
 *   it is measured with `window.innerWidth` / `window.innerHeight`.
 *
 *   Video plane. The panel's real output resolution: 3840x2160 on a UHD set,
 *   1920x1080 on an FHD set. The TV's scaler upscales the graphics canvas to
 *   the panel in hardware, after rasterization, so nothing in CSS can observe
 *   or compensate for it. This is read from `webOS.deviceInfo().screenWidth` /
 *   `.screenHeight`.
 *
 * Neither number is derivable from the other, so this module keeps them apart
 * and never averages or maxes them together.
 *
 * @see https://webostv.developer.lge.com/develop/specifications/app-resolution
 * @see https://github.com/webOS-TV-app-samples/Resolution
 *
 * VERSION NUMBERING
 *   Three schemes are in circulation and they are easy to confuse:
 *
 *     internal  6, 7, 8, 9, 10, 11    what the UA's `webOS-<n>` segment carries
 *     TV        6, 22, 23, 24, 25, 26  what LG's spec pages are titled with
 *     Chrome    79, 87, 94, 108, 121   the webview engine, per .browserslistrc
 *
 *   normalizeInternalVersion() accepts either the internal or the TV form and
 *   returns the internal one, so a UA that changed scheme would not silently
 *   invert every version comparison in the app.
 *
 * GATING PHILOSOPHY
 *   Capability detection is the authority. The minimum versions in CAPABILITIES
 *   are documentation-derived expectations, recorded so the debug dump can
 *   falsify them on real hardware; they never decide behaviour on their own.
 *   That is deliberate: firmware backports make version sniffing unreliable, and
 *   a version newer than this table must never disable a feature. See
 *   isVersionAtLeast().
 */

/** webOS's own version numbers, as distinct from the TV/marketing ones. */
export type WebOSVersion = number;

/**
 * Known releases, newest last.
 *
 * Chrome 121 (webOS internal 10) is the last engine version LG has published
 * alongside a webOS version here; internal 11 / TV 26 is listed for the version
 * arithmetic only, deliberately without a Chrome figure rather than guessing
 * one. Mirrors .browserslistrc, which is the build's support matrix of record.
 */
const RELEASES = [
  { internal: 6, tv: 6, chrome: 79 },
  { internal: 7, tv: 22, chrome: 87 },
  { internal: 8, tv: 23, chrome: 94 },
  { internal: 9, tv: 24, chrome: 108 },
  { internal: 10, tv: 25, chrome: 121 },
  { internal: 11, tv: 26, chrome: undefined }
] as const satisfies readonly {
  internal: WebOSVersion;
  tv: number;
  chrome: number | undefined;
}[];

/** Newest internal webOS version this module knows about. */
export const NEWEST_KNOWN_VERSION: WebOSVersion = 11;

/** The lowest webOS version this app supports (Chrome 79). */
export const MIN_SUPPORTED_VERSION: WebOSVersion = 6;

/**
 * TV version -> internal version.
 *
 * Only the TV numbers that differ from the internal ones appear. webOS TV 6 is
 * 6 in both schemes.
 */
const TV_TO_INTERNAL = new Map<number, WebOSVersion>(
  RELEASES.filter((r) => r.tv !== r.internal).map((r) => [r.tv, r.internal])
);

/** First TV version that is numbered independently of the internal one. */
const FIRST_DIVERGENT_TV_VERSION = 22;

/**
 * Dotted numeric version compare. Non-numeric segments are treated as 0 so a
 * malformed value degrades gracefully instead of throwing.
 */
export function compareVersions(a: string, b: string): number {
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
 * True when `version` is at least `minimum`.
 *
 * An unknown version - one newer than anything in RELEASES - is treated as the
 * newest known, never the oldest. Gating on a version can only ever turn a
 * feature off for firmware we recognise, so a TV from the future keeps
 * everything rather than silently losing it.
 */
export function isVersionAtLeast(
  version: WebOSVersion | undefined,
  minimum: WebOSVersion
): boolean {
  if (version === undefined || !isFinite(version)) return true;
  if (version > NEWEST_KNOWN_VERSION) return true;
  return version >= minimum;
}

/** The TV/marketing version for an internal webOS version, if known. */
export function tvVersionFor(version: WebOSVersion): number | undefined {
  return RELEASES.find((r) => r.internal === version)?.tv;
}

/** The webview engine version for an internal webOS version, if known. */
export function chromeVersionFor(version: WebOSVersion): number | undefined {
  return RELEASES.find((r) => r.internal === version)?.chrome;
}

/** Which numbering a raw UA version string turned out to be in. */
export type VersionScheme = 'internal' | 'tv' | 'unrecognised';

export interface NormalizedVersion {
  version: WebOSVersion;
  scheme: VersionScheme;
}

/**
 * Coerce a version from the app UA into the internal scheme.
 *
 * The UA is built by `vendorExtension.userAgent` in appinfo.json, which
 * interpolates `$platformVersion$`. PENDING: it has not been confirmed on a
 * device which numbering that substitution produces - this exists because
 * `hasCastCoreConflict()` gates on `>= 10` for the webOS 2025 firmware, and that
 * is only correct under the internal scheme. Under the TV scheme an unhandled
 * "25" would compare `>= 10` as true on TV 22, 23 and 24 too, blocking the cast
 * fix on three firmware lines it is not meant to touch.
 *
 * The two schemes are distinguishable: the TV numbering jumps 6 -> 22 and never
 * returns to single digits, so anything at or above 22 is unambiguously TV.
 * Values below that are identical under both schemes up to internal 10, and are
 * reported as 'internal' because that is the scheme the rest of the app uses.
 * Run the Phase 8 debug dump on a device to settle it; the answer lands in the
 * `versionScheme` field.
 */
export function normalizeInternalVersion(
  raw: string | undefined
): NormalizedVersion {
  if (raw === undefined) return { version: 0, scheme: 'unrecognised' };

  const major = Number.parseInt(raw, 10);
  if (!Number.isFinite(major)) return { version: 0, scheme: 'unrecognised' };

  if (major >= FIRST_DIVERGENT_TV_VERSION) {
    const internal = TV_TO_INTERNAL.get(major);
    if (internal !== undefined) return { version: internal, scheme: 'tv' };
    // A TV number from the future (webOS TV 27+). Internally that is past the
    // newest release we know, which is the forward-compatible answer.
    return { version: major, scheme: 'tv' };
  }

  return { version: major, scheme: 'internal' };
}

/* ------------------------------------------------------- capability matrix --- */

export type CapabilityId =
  | 'deviceInfo'
  | 'playbackResolution'
  | 'uhd'
  | 'uhd8K'
  | 'oled'
  | 'sdkVersion'
  | 'tuner'
  | 'appInfo'
  | 'luna';

export interface Capability {
  readonly id: CapabilityId;
  readonly label: string;
  /** Where the value comes from. */
  readonly source: string;
  /** Lowest internal webOS version expected to provide it. */
  readonly minInternalVersion: WebOSVersion;
  /** The runtime predicate that actually decides availability. */
  readonly probe: string;
  /** What is used when the probe fails. */
  readonly fallback: string;
  /** What the app loses when the probe fails. */
  readonly consequence: string;
}

/**
 * The matrix of record, dumped by `__ytaf_debug__` with a verdict per row.
 *
 * `minInternalVersion` is an expectation to be checked against hardware, not a
 * switch: every row's behaviour is decided by its `probe` string. Where LG
 * publishes no version at all the minimum is the app's own support floor, which
 * reads as "not a version-gated capability, just probe it".
 */
export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'deviceInfo',
    label: 'webOS API object',
    source: 'window.webOS (injected)',
    minInternalVersion: MIN_SUPPORTED_VERSION,
    probe: "typeof window.webOS === 'object' && window.webOS !== null",
    fallback: 'UA-parsed model / firmware / platform version',
    consequence: 'No playback resolution; scale still resolves to 1.0'
  },
  {
    id: 'playbackResolution',
    label: 'Video playback resolution',
    source: 'webOS.deviceInfo().screenWidth / .screenHeight',
    minInternalVersion: MIN_SUPPORTED_VERSION,
    probe: 'both fields are finite positive numbers',
    fallback: 'window.screen.width / .height',
    consequence: 'Panel class and max-resolution ceiling are guesses'
  },
  {
    id: 'uhd',
    label: 'UHD panel flag',
    source: 'webOS.deviceInfo().uhd',
    minInternalVersion: MIN_SUPPORTED_VERSION,
    probe: "typeof info.uhd === 'boolean'",
    fallback: 'inferred from playback height',
    consequence: 'Panel class falls back to height inference'
  },
  {
    id: 'uhd8K',
    label: '8K panel flag',
    source: 'webOS.deviceInfo().uhd8K',
    minInternalVersion: MIN_SUPPORTED_VERSION,
    probe: "typeof info.uhd8K === 'boolean'",
    fallback: 'false',
    consequence: 'No 8K tier'
  },
  {
    id: 'oled',
    label: 'OLED panel flag',
    source: 'webOS.deviceInfo().oled',
    minInternalVersion: MIN_SUPPORTED_VERSION,
    probe: 'info.oled === true',
    fallback: 'parsePanelType() model-string match',
    consequence: 'LCD parts can be misread as OLED'
  },
  {
    id: 'sdkVersion',
    label: 'webOS TV version',
    source: 'webOS.deviceInfo().sdkVersion',
    minInternalVersion: MIN_SUPPORTED_VERSION,
    probe: "typeof info.sdkVersion === 'string'",
    fallback: 'UA platform version',
    consequence: 'Only the internal numbering is available'
  },
  {
    id: 'tuner',
    label: 'Tuner presence',
    source: 'webOS.deviceInfo().tuner',
    minInternalVersion: 11,
    probe: "typeof info.tuner === 'boolean'",
    fallback: 'not consumed',
    consequence: 'None; recorded for diagnostics only'
  },
  {
    id: 'appInfo',
    label: "App's own appinfo.json",
    source: 'webOS.fetchAppInfo()',
    minInternalVersion: MIN_SUPPORTED_VERSION,
    probe: 'callback delivers an object with a resolution',
    fallback: 'not needed',
    consequence:
      'None: the canvas is measured from innerWidth/innerHeight, and the design space is fixed at 1920x1080 because that is the space the YouTube TV UI is authored against'
  },
  {
    id: 'luna',
    label: 'Luna service requests',
    source: 'webOS.service.request()',
    minInternalVersion: MIN_SUPPORTED_VERSION,
    probe: "typeof window.webOS.service?.request === 'function'",
    fallback: 'cross-check skipped',
    consequence: 'No second opinion on the reported specs'
  }
];

/* --------------------------------------------------------- codec matrix --- */

export type VideoCodec = 'av1' | 'vp9' | 'avc' | 'hevc';

/**
 * Which codecs the platform can decode, by video plane height.
 *
 * From the AV Format specification. The two rules that combine into this table:
 *
 *   - The per-resolution codec rows are unchanged between webOS TV 6.0 and 26:
 *     Full HD tops out at H.264 and HEVC 1920x1080; 4K UHD and 8K UHD add VP9
 *     and AV1 renditions.
 *   - The container table is narrower for UHD. For the UHD resolutions
 *     (3840x2160 and 4096x2160) the supported combinations are H.264/AVC and HEVC
 *     only, with no VP9 and no AV1 - which is what cancels the VP9/AV1 renditions
 *     the resolution rows advertise for exactly those heights.
 *
 * The second rule is the one that bites, and it is why this table is narrower
 * than the codec rows suggest. Pinning AV1 or VP9 on a 4K panel cannot succeed:
 * every UHD rendition is in a codec the platform will not decode. Filtering it
 * silently used to leave the user on whatever the server offered with no
 * explanation, so force-codec.js refuses the selection with a reason instead.
 *
 * 8K is the exception that proves the rule: 7680x4320 is not a UHD resolution by
 * that container table, so AV1 is decodable there.
 *
 * @see https://webostv.developer.lge.com/develop/specifications/video-audio-260
 */
const CODEC_BANDS: readonly {
  readonly minHeight: number;
  readonly codecs: readonly VideoCodec[];
}[] = [
  { minHeight: 4320, codecs: ['av1', 'hevc'] },
  { minHeight: 2160, codecs: ['avc', 'hevc'] },
  { minHeight: 0, codecs: ['av1', 'vp9', 'avc', 'hevc'] }
];

/** The lowest video plane height treated as UHD. 4096x2160 shares the height. */
const UHD_MIN_HEIGHT = 2160;

/**
 * Codecs decodable at a given video plane height, or `null` when the height is
 * unknown.
 *
 * Unknown is not the same as "everything": with no playback resolution there is
 * no basis to refuse anything, so the platform's own probe remains the decider.
 */
export function decodableCodecsAt(
  playbackHeight: number | undefined
): readonly VideoCodec[] | null {
  if (
    playbackHeight === undefined ||
    !isFinite(playbackHeight) ||
    playbackHeight <= 0
  ) {
    return null;
  }

  return (
    CODEC_BANDS.find((band) => playbackHeight >= band.minHeight)?.codecs ?? null
  );
}

/**
 * Whether a codec can be decoded at the given video plane height.
 *
 * Returns `true` when the height is unknown, deferring to the platform probe -
 * refusing on absent information would lock users out of a codec their set
 * handles fine.
 */
export function canDecodeAt(
  codec: VideoCodec,
  playbackHeight: number | undefined
): boolean {
  const decodable = decodableCodecsAt(playbackHeight);
  return decodable === null ? true : decodable.includes(codec);
}

/**
 * Human-readable reason a codec was refused, for a notification.
 *
 * The pixel height is the video plane's, so this reads correctly on a 4K panel
 * regardless of which graphics canvas the app happens to be running on.
 */
export function codecRefusalReason(
  codec: VideoCodec,
  playbackHeight: number | undefined
): string | undefined {
  if (canDecodeAt(codec, playbackHeight)) return undefined;
  return playbackHeight !== undefined && playbackHeight >= UHD_MIN_HEIGHT
    ? `this TV decodes ${playbackHeight}p video in H.264 and HEVC only, so ${codec.toUpperCase()} is not available at that resolution`
    : `${codec.toUpperCase()} is not available at ${playbackHeight ?? 0}p on this TV`;
}
