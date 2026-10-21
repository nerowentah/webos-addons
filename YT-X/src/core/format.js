/** Small formatting helpers shared by the DOM text readouts. */

/** mm:ss, or h:mm:ss past an hour. */
export function formatTime(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A quoted CSS string; backslashes, quotes and newlines are escaped. */
export function cssString(value) {
  const escaped = String(value)
    .replace(/[\\"]/g, '\\$&')
    .replace(/[\n\r]/g, ' ');
  return `"${escaped}"`;
}
