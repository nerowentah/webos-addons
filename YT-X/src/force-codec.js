import { configRead, configAddChangeListener } from './config.js';
import { showNotification } from './notifications.js';
import { NOTIFICATIONS } from './ui-text.js';
import { addTVSpecsChangeListener, getTVSpecs } from './tv-specs';
import { canDecodeAt, codecRefusalReason, VIDEO_CODECS } from './webos-caps';

/**
 * Force Video Codec - pins video playback to a chosen codec. All three levers (isTypeSupported, canPlayType, streamingData filtering) only ever *narrow* what the player accepts: a forced codec is never reported as supported when the platform says it is not. Audio entries pass through untouched; a list with no rendition in the wanted codec is left intact; a codec the platform denies at the panel's actual output resolution is refused before any hook installs. Takes effect on reload - the player probes codecs once at startup - so the change handler says so rather than letting the setting look broken.
 */

/** Codec tokens as they appear in MSE MIME strings and adaptiveFormats entries. Both spellings of each are covered; deliberately no VP8 entry - YouTube does not serve it for video any more, and an unrecognised codec is always left alone. */
const CODEC_PATTERNS = {
  av1: /av0?1/i,
  vp9: /vp0?9/i,
  avc: /avc[13]|h\.?264/i,
  hevc: /hev1|hvc1|h\.?265/i
};

/** Probe strings used to ask the platform whether a codec is real here; any one passing counts as supported. */
const CODEC_PROBES = {
  av1: [
    'video/mp4; codecs="av01.0.08M.08"',
    'video/webm; codecs="av01.0.05M.08"'
  ],
  vp9: ['video/webm; codecs="vp9"', 'video/mp4; codecs="vp09.00.10.08"'],
  avc: ['video/mp4; codecs="avc1.640028"', 'video/mp4; codecs="avc1.42E01E"'],
  hevc: [
    'video/mp4; codecs="hev1.1.6.L93.B0"',
    'video/mp4; codecs="hvc1.1.6.L93.B0"'
  ]
};

/** Config values that pin to one codec, as opposed to 'auto' / 'no_av1'. */
const PINNED_MODES = [...VIDEO_CODECS];

let mode = 'auto';

// Installed at most once and gated internally on `mode`; never uninstalled, because rewrapping JSON.parse / isTypeSupported after other modules (adblock.js) have wrapped them would drop their hooks on the floor. Cost when idle is one call and one string compare.
let installed = false;

let origIsTypeSupported = null;
let origCanPlayType = null;
let origParse = null;

/** Set when the current player response carries no rendition in the wanted codec; while set, capability answers go back to the truth so a player that re-probes is not left with nothing to choose from. */
let unsatisfiable = false;

// Hoisted: detectCodec runs a few times per format entry and Object.keys() would allocate on each one.
const CODEC_NAMES = Object.keys(CODEC_PATTERNS);

/** The video codec named in a MIME or codec string, or null if not recognised. */
function detectCodec(str) {
  for (let i = 0; i < CODEC_NAMES.length; i++) {
    if (CODEC_PATTERNS[CODEC_NAMES[i]].test(str)) return CODEC_NAMES[i];
  }
  return null;
}

/** The guard that keeps audio out of everything below: without it the "does not match the wanted codec" test would decline every audio SourceBuffer and playback would run silent. */
function isVideoMime(type) {
  return /^\s*video\//i.test(type);
}

/** Whether the current mode permits a given codec. Deliberately does not consult `unsatisfiable`: that flag relaxes global capability probes, while the format lists have their own per-response guard in filterList(), so letting it reach here would skip responses whenever the previous one lacked the codec. */
function allowsCodec(codec) {
  if (mode === 'auto') return true;
  if (mode === 'no_av1') return codec !== 'av1';
  return codec === mode;
}

/** Whether the capability probes should be narrowed right now. */
function narrowing() {
  return installed && mode !== 'auto' && !unsatisfiable;
}

/** Ask the platform, through the untouched probe, whether a codec is real here. */
function platformSupports(codec) {
  const probes = CODEC_PROBES[codec];
  if (!probes) return false;

  const test =
    origIsTypeSupported ||
    (window.MediaSource && MediaSource.isTypeSupported) ||
    null;

  // No MSE to ask: assume yes rather than blocking the user on a probe we cannot run; the never-empty guards still apply.
  if (typeof test !== 'function') return true;

  for (const probe of probes) {
    try {
      if (test.call(window.MediaSource, probe)) return true;
    } catch {
      // A throwing probe is a no, not a crash.
    }
  }
  return false;
}

/** The video codec of an adaptiveFormats/formats entry; null for audio. */
function entryCodec(entry) {
  const mime = entry && entry.mimeType;
  if (typeof mime !== 'string' || !isVideoMime(mime)) return null;
  return detectCodec(mime);
}

/** Strip disallowed video entries from one format list, in place. Returns the number removed, or -1 when the list holds no rendition in the wanted codec; in that case nothing is removed, because emptying the list would leave the player with no video at all. */
function filterList(list) {
  let allowed = 0;
  let disallowed = 0;

  for (let i = 0; i < list.length; i++) {
    const codec = entryCodec(list[i]);
    if (codec === null) continue; // audio, or a codec we do not recognise
    if (allowsCodec(codec)) allowed++;
    else disallowed++;
  }

  if (disallowed === 0) return 0;
  if (allowed === 0) return -1;

  let write = 0;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    const codec = entryCodec(entry);
    if (codec !== null && !allowsCodec(codec)) continue;
    list[write++] = entry;
  }
  list.length = write;
  return disallowed;
}

/** Filter both format lists on a streamingData block. The two lists are judged separately on purpose: `formats` holds the muxed progressive streams (AVC in practice, no AV1 equivalent), so judging them together would either strip the progressive fallback entirely or block the adaptive filtering the user asked for. */
function filterStreamingData(streaming) {
  if (!streaming) return;

  const adaptiveResult = Array.isArray(streaming.adaptiveFormats)
    ? filterList(streaming.adaptiveFormats)
    : 0;

  if (Array.isArray(streaming.formats)) filterList(streaming.formats);

  // adaptiveFormats alone decides whether this video can honour the setting; it is the list the MSE player negotiates from.
  if (adaptiveResult === -1) {
    if (!unsatisfiable) {
      unsatisfiable = true;
      console.info(
        `[ForceCodec] This video has no ${mode.toUpperCase()} stream; using what the server offers.`
      );
    }
  } else if (unsatisfiable) {
    unsatisfiable = false;
  }
}

function installHooks() {
  if (installed) return;
  installed = true;

  // Capability probe. Narrowing only: an allowed codec is still handed to the platform to answer, so this can never claim support that is absent.
  if (window.MediaSource && typeof MediaSource.isTypeSupported === 'function') {
    origIsTypeSupported = MediaSource.isTypeSupported;
    MediaSource.isTypeSupported = function (type) {
      if (narrowing() && typeof type === 'string' && isVideoMime(type)) {
        const codec = detectCodec(type);
        if (codec !== null && !allowsCodec(codec)) {
          return false;
        }
      }
      return origIsTypeSupported.apply(this, arguments);
    };
  }

  // Element-level form of the same question.
  if (window.HTMLMediaElement) {
    origCanPlayType = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type) {
      if (narrowing() && typeof type === 'string' && isVideoMime(type)) {
        const codec = detectCodec(type);
        if (codec !== null && !allowsCodec(codec)) return '';
      }
      return origCanPlayType.apply(this, arguments);
    };
  }

  // The server's offer. Guards ordered cheapest-first: a streamingData response is tens of kilobytes, while the thousands of small blobs YouTube parses constantly are dismissed on length alone, before the result is looked at.
  origParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    if (mode === 'auto' || typeof text !== 'string' || text.length < 1000) {
      return origParse.call(this, text, reviver);
    }

    const out = origParse.call(this, text, reviver);
    if (!out || typeof out !== 'object') return out;
    try {
      if (out.streamingData) filterStreamingData(out.streamingData);
      else if (out.playerResponse && out.playerResponse.streamingData) {
        filterStreamingData(out.playerResponse.streamingData);
      }
    } catch {
      // Filtering must never break a parse.
    }
    return out;
  };
}

/** The video plane height, or undefined while still unknown. This is the panel's output resolution, not the graphics canvas (a 4K TV runs this app on a 1920x1080 canvas, and gating a codec on the canvas would decide a 4K question from a 1080p number). Undefined means "do not refuse", because the platform probe is the better authority when available. */
function playbackHeight() {
  const specs = getTVSpecs();
  if (specs === undefined) return undefined;
  return specs.playbackHeight > 0 ? specs.playbackHeight : undefined;
}

/** Why a pinned codec cannot work here, or null when it can. Two independent questions, both required: (1) can the platform decode it at this video plane height (the UHD container table only pairs H.264/HEVC with 4K, while MSE says yes to VP9/AV1 broadly)? (2) does MSE expose it at all (HEVC rarely is on webOS even where hardware decodes it)? Checked in that order because the first refusal reason is the more useful one and the one this change was made to catch. */
function pinnedCodecBlocked(codec) {
  if (!canDecodeAt(codec, playbackHeight())) {
    return codecRefusalReason(codec, playbackHeight());
  }
  if (!platformSupports(codec)) {
    return 'Codec unavailable on this TV';
  }
  return null;
}

/**
 * Apply the stored setting.
 *
 * @param {boolean} interactive true when the user just changed it, the only time there is a DOM to put a notification in and the only time a "reload to apply" message is worth showing.
 */
function applyMode(interactive) {
  let wanted = configRead('forceVideoCodec');
  // A stored value this build does not know - from an older or newer build's option set - matches no codec below, and installing hooks for it would refuse every video format; fall back to Auto.
  if (wanted !== 'no_av1' && PINNED_MODES.indexOf(wanted) === -1)
    wanted = 'auto';

  if (wanted === 'auto') {
    mode = 'auto';
    unsatisfiable = false;
    if (interactive) showNotification(NOTIFICATIONS.codecReload('Auto'));
    return;
  }

  if (wanted === 'no_av1') {
    // A negative preference, not a pin, so the resolution table does not apply; avoiding AV1 is satisfiable by every codec the platform can decode.
    mode = 'no_av1';
    unsatisfiable = false;
    if (interactive) showNotification(NOTIFICATIONS.codecReload('Avoid AV1'));
    return;
  }

  // Install first so the probe below goes through the saved original rather than whatever else may have wrapped isTypeSupported since startup.
  installHooks();

  if (PINNED_MODES.indexOf(wanted) !== -1) {
    const refusal = pinnedCodecBlocked(wanted);
    if (refusal !== null) {
      mode = 'auto';
      console.warn(`[ForceCodec] ${refusal}; leaving codec selection alone.`);
      if (interactive) {
        showNotification(NOTIFICATIONS.codecUnavailable);
      }
      return;
    }
  }

  mode = wanted;
  unsatisfiable = false;

  if (interactive) {
    showNotification(NOTIFICATIONS.codecReload(mode.toUpperCase()));
  }
}

configAddChangeListener('forceVideoCodec', () => applyMode(true));

applyMode(false);

// The video plane is only known once deviceInfo answers, after this module evaluates; a pin accepted against an unknown height can turn out to be undecodable on a 4K panel, so re-apply silently when it lands - a correction of a gate the user already made, and a notification would arrive after the setting's message was long gone.
addTVSpecsChangeListener(() => applyMode(false));
