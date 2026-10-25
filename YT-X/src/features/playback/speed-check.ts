// Pure parts of the playback speed feature (playback-speed.ts); no DOM, so the
// tests can load them directly.

/** Share of the requested extra speed the media clock must show to count as honoured. */
const HONOURED_SHARE = 0.5;

/** The rate a Playback Speed mode stands for; unknown modes mean normal speed. */
export function rateForMode(mode: string): number {
  const rate = Number(mode);
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

/**
 * Whether the media clock moved as `rate` demands: `mediaSeconds` of video time
 * over `wallSeconds` of wall time. A platform whose player ignores the rate
 * (the webOS browser's hardware path) shows about 1x whatever was asked, so
 * anything short of half the extra (or missing) speed counts as ignored.
 */
export function rateWasHonoured(
  rate: number,
  mediaSeconds: number,
  wallSeconds: number
): boolean {
  if (rate === 1 || wallSeconds <= 0) return true;
  const observed = mediaSeconds / wallSeconds;
  const wantedShift = rate - 1;
  return (observed - 1) / wantedShift >= HONOURED_SHARE;
}
