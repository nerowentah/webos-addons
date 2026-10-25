// True in the native Cobalt build, whose preload script sets `__ytxNative`
// before anything else runs. The userscript under the Cobalt user agent
// (isCobaltUa) is a webOS web app and does not set it, so the two are told
// apart by the marker, not by the user agent.
export function isNativeBuild(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as { __ytxNative?: unknown }).__ytxNative === true
  );
}
