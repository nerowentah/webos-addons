/**
 * webOS version numbering and the capability matrix.
 *
 * Two independent rendering planes, neither derivable from the other: the
 * graphics plane (fixed 1920x1080/1280x720 canvas, from innerWidth/innerHeight,
 * hardware-upscaled to the panel) and the video plane (the panel's real output,
 * from deviceInfo().screenWidth/Height). Never average or max them together.
 * Capability detection is the authority — firmware backports make version
 * sniffing unreliable, and a newer version must never disable a feature.
 *
 * @see https://webostv.developer.lge.com/develop/specifications/app-resolution
 * @see https://github.com/webOS-TV-app-samples/Resolution
 */

/** webOS's own version numbers, as distinct from the TV/marketing ones. */
export type WebOSVersion = number;

/**
 * Known releases, newest last. Chrome 120 (internal 10) is the last engine
 * version LG published; internal 11 deliberately has no Chrome figure rather
 * than a guess. Mirrors .browserslistrc, the build's support matrix of record.
 */
const RELEASES = [
  { internal: 6, tv: 6, chrome: 79 },
  { internal: 7, tv: 22, chrome: 87 },
  { internal: 8, tv: 23, chrome: 94 },
  { internal: 9, tv: 24, chrome: 108 },
  { internal: 10, tv: 25, chrome: 120 },
  { internal: 11, tv: 26, chrome: undefined }
] as const satisfies readonly {
  internal: WebOSVersion;
  tv: number;
  chrome: number | undefined;
}[];

/**
 * TV -> internal version. Only numbers that differ appear (webOS TV 6 is 6 in
 * both schemes).
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

/** The TV/marketing version for an internal webOS version, if known. */
export function tvVersionFor(version: WebOSVersion): number | undefined {
  return RELEASES.find((r) => r.internal === version)?.tv;
}

/** Which numbering a raw UA version string turned out to be in. */
export type VersionScheme = 'internal' | 'tv' | 'unrecognised';

interface NormalizedVersion {
  version: WebOSVersion;
  scheme: VersionScheme;
}

/**
 * Coerce a version from the app UA into the internal scheme. Unconfirmed which
 * numbering `$platformVersion$` produces, and it matters: hasCastCoreConflict()'s
 * `>= 10` gate is only correct internally — under the TV scheme a bare "25"
 * would compare >= 10 on TV 22-24 and block the cast fix on lines it must not
 * touch. Distinguishable: the TV numbering jumps 6 -> 22 and never returns to
 * single digits; below that the schemes coincide up to internal 10, reported as
 * 'internal' because that is what the rest of the app uses.
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
    // A TV number from the future: past the newest release we know, the
    // forward-compatible answer.
    return { version: major, scheme: 'tv' };
  }

  return { version: major, scheme: 'internal' };
}

/* --------------------------------------------------------- codec matrix --- */

/** Every video codec token the app knows about, newest codec last. */
export const VIDEO_CODECS = ['av1', 'vp9', 'avc', 'hevc'] as const;

type VideoCodec = (typeof VIDEO_CODECS)[number];

/**
 * Which codecs the platform can decode, by video plane height (from the AV
 * Format specification). The UHD container table is narrower than the
 * resolution rows: 3840/4096x2160 pair only with H.264 and HEVC, cancelling
 * the VP9/AV1 renditions the rows advertise for those heights — so pinning
 * AV1 or VP9 on a 4K panel can never succeed, and force-codec.ts refuses it
 * with a reason. 8K (7680x4320) is not UHD by that table, so AV1 works there.
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
 * unknown — no basis to refuse anything, so the platform probe decides.
 */
function decodableCodecsAt(
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
 * Whether a codec can be decoded at the given video plane height. `true` when
 * the height is unknown: refusing on absent information would lock users out
 * of a codec their set handles fine.
 */
export function canDecodeAt(
  codec: VideoCodec,
  playbackHeight: number | undefined
): boolean {
  const decodable = decodableCodecsAt(playbackHeight);
  return decodable === null ? true : decodable.includes(codec);
}

/**
 * Human-readable reason a codec was refused, for a notification. The height is
 * the video plane's, so this reads correctly regardless of the graphics canvas.
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
