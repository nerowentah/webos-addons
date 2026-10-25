// Builds the two native Cobalt scripts from the webpack output:
//
//   node tools/native/native-preload.ts [outDir]     (default dist/native)
//
// adblockPreload.js runs before the YouTube document exists and carries only
// the response hooks (dist/native/nativeEarly.js): the full bundle cannot run
// there, its modules wait for YouTube objects. adblockMain.js is the full
// bundle, injected by Cobalt after load. The bundle's "automatic publicPath"
// lookup gets a fallback URL (only the webOS font asset uses it). Startup
// errors are kept in localStorage under `ytx-err` for the debug port.
//
// RF1705's runtime runs both scripts in every web module it starts (the splash
// screen and the debug console as well as the YouTube page: 37 runs for 13
// launches in one session), so each is wrapped to do nothing outside youtube.com;
// the splash and console pages are h5vcc-* / file: documents with no use for them.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BUNDLE = fileURLToPath(
  new URL('../../dist/native/nativeMain.js', import.meta.url)
);
const EARLY = fileURLToPath(
  new URL('../../dist/native/nativeEarly.js', import.meta.url)
);
const PUBLIC_PATH_THROW =
  'if(!e)throw new Error("Automatic publicPath is not supported in this browser")';
const PUBLIC_PATH_FALLBACK = 'if(!e)e="https://www.youtube.com/s/ytx/x"';

/** Wraps a script so it only runs in the YouTube page, not the runtime's own web modules. */
const ONLY_YOUTUBE = String.raw`location.protocol==='https:'&&/(^|\.)youtube\.com$/.test(location.hostname)`;

const PROBE = `;(function(){window.__ytxNative=true;window.__ytxPreloadExecuted=true;window.__ytxPreloadInfo={at:Date.now(),href:String(location.href)};try{localStorage.setItem('ytx-preload-probe',JSON.stringify(window.__ytxPreloadInfo))}catch(e){}})();
window.__ytxErrs=[];function __ytxSave(){try{localStorage.setItem('ytx-err',JSON.stringify(window.__ytxErrs.slice(0,8)))}catch(e){}}
window.addEventListener('error',function(e){window.__ytxErrs.push('E '+e.message+' @'+String(e.filename||'').slice(-80)+':'+e.lineno+':'+e.colno+' '+(e.error&&e.error.stack||'').slice(0,300));__ytxSave()},true);
window.addEventListener('unhandledrejection',function(e){window.__ytxErrs.push('R '+(e.reason&&(e.reason.stack||e.reason)));__ytxSave()});
try{localStorage.removeItem('ytx-err')}catch(e){}
`;

/** The early script: marker and error trap, then the hooks-only bundle. */
export function buildPreload(early: string, fullModel = ''): string {
  const model = fullModel
    ? `window.__ytxFullModel=${JSON.stringify(fullModel)};
`
    : '';
  return `if(${ONLY_YOUTUBE}){
${PROBE}${model}try{
${early}
;window.__ytxEarlyHooks=true}catch(e){window.__ytxErrs.push('T '+e+' '+(e&&e.stack||'').slice(0,400));__ytxSave()}
}
`;
}

/** The late script: the full bundle with the publicPath fallback. */
export function buildMain(bundle: string): string {
  if (bundle.split(PUBLIC_PATH_THROW).length !== 2) {
    throw new Error('expected exactly one automatic-publicPath throw');
  }
  const patched = bundle.replace(PUBLIC_PATH_THROW, PUBLIC_PATH_FALLBACK);
  return `if(${ONLY_YOUTUBE}){
try{
${patched}
}catch(e){(window.__ytxErrs=window.__ytxErrs||[]).push('T '+e+' '+(e&&e.stack||'').slice(0,400));try{localStorage.setItem('ytx-err',JSON.stringify(window.__ytxErrs.slice(0,8)))}catch(x){}}
}
`;
}

if (import.meta.main) {
  const out =
    process.argv[2] ??
    fileURLToPath(new URL('../../dist/native', import.meta.url));
  mkdirSync(out, { recursive: true });
  writeFileSync(
    `${out}/adblockPreload.js`,
    buildPreload(readFileSync(EARLY, 'utf8'))
  );
  writeFileSync(
    `${out}/adblockMain.js`,
    buildMain(readFileSync(BUNDLE, 'utf8'))
  );
  console.log(
    `native-preload: wrote adblockPreload.js and adblockMain.js to ${out}`
  );
}
