/** Small formatting helpers shared by the DOM text readouts. */

/** mm:ss, or h:mm:ss past an hour; negative and non-finite input (NaN, Infinity) clamps to 0:00. */
export function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * A quoted CSS string token for use as a `content` value. Backslashes and quotes are escaped; control characters (which include the CSS newlines \n \r \f, and NUL) become spaces, so the result can never terminate the string or the declaration early. `<` becomes the CSS escape `\3c ` (the space ends the escape and is consumed), so the text can never close a surrounding `<style>` element.
 */
export function cssString(value: unknown): string {
  const escaped = String(value)
    .replace(/[\\"]/g, '\\$&')
    .replace(/</g, '\\3c ')
    .replace(/\p{Cc}/gu, ' ');
  return `"${escaped}"`;
}
