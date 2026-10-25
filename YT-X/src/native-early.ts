// The native Cobalt build's early entry. It runs before the page's own scripts
// and installs the response hooks only; everything else (UI, features) comes
// from the full bundle after load, because modules that wait for YouTube's
// objects (top-level await) would otherwise hold these hooks back too.
import './platform/cobalt-polyfills';
import './features/adblock/adblock';
import './native/identity';
import './youtube/hooks/json-stringify';
import './features/adblock/shorts';
import './features/adblock/members-only';
import './features/adblock/remove-endscreen';
