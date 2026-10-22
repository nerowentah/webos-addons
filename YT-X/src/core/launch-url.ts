// Pure launch-parameter handling: no DOM access, so it runs under `node --test`.

/** Voice launch (Google Assistant / ThinQ): `intent` is e.g. PlayContent or SearchContent. */
export interface VoiceLaunchTarget {
  intent: string;
  intentParam: string;
}

/** A DIAL/cast query string, a same-origin YouTube URL, or a voice intent. */
export type ContentTarget = string | VoiceLaunchTarget;

/**
 * Parameters webOS launches (or relaunches) the app with. `target` is a custom alias for `contentTarget`, because launches with `contentTarget` do not respect the `handlesRelaunch` appinfo option.
 */
export interface LaunchParams {
  contentTarget?: ContentTarget;
  target?: ContentTarget;
  [key: string]: unknown;
}

// Also the bare-launch fallback, so a launch without a target keeps the env flags.
export const BASE_LAUNCH_URL =
  'https://www.youtube.com/tv?env_forceFullAnimation=1&env_enableWebSpeech=1&env_enableVoice=1#/';

const MAX_LAUNCH_PARAMS_LENGTH = 8192;
const MAX_TARGET_LENGTH = 2048;
const MAX_INTENT_LENGTH = 64;
const MAX_VOICE_QUERY_LENGTH = 512;

// Seen so far: PlayContent, SearchContent.
const URL_SCHEME_REGEX = /^[a-z][\d+.a-z-]*:/i;
const VOICE_INTENT_REGEX = /^([A-Za-z]+)Content$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses the platform-injected `window.launchParams` JSON; anything unusable yields `{}`. */
export function parseLaunchParams(raw: unknown): LaunchParams {
  if (typeof raw !== 'string' || raw.length > MAX_LAUNCH_PARAMS_LENGTH) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    // Platform-launched params are not guaranteed to be valid JSON; ignore them.
    return {};
  }
}

/** The launch params' `contentTarget`, falling back to the custom `target`. */
export function contentTargetOf(params: unknown): unknown {
  if (!isRecord(params)) return undefined;
  return params['contentTarget'] ?? params['target'];
}

function getBaseUrl(): URL {
  return new URL(BASE_LAUNCH_URL);
}

function urlForQuery(query: string): string | null {
  // Out of app dial launch with second screen on home: { contentTarget: 'pairingCode=<UUID>&theme=cl&dialLaunch=watch' }
  const normalized = query.startsWith('v=v=') ? query.slice(2) : query;
  const extra = [...new URLSearchParams(normalized)];
  if (extra.length === 0) return null;

  const url = getBaseUrl();
  url.search = new URLSearchParams([...url.searchParams, ...extra]).toString();
  return url.toString();
}

function urlForVoice(target: Record<string, unknown>): string | null {
  const { intent, intentParam } = target;
  if (typeof intent !== 'string' || typeof intentParam !== 'string') {
    return null;
  }
  if (intent.length > MAX_INTENT_LENGTH) return null;

  const query = intentParam.slice(0, MAX_VOICE_QUERY_LENGTH);
  if (query.trim() === '') return null;

  // Ctrl+F tvhtml5LaunchUrlComponentChanged & REQUEST_ORIGIN_GOOGLE_ASSISTANT in base.js for info
  const voiceContentIntent =
    VOICE_INTENT_REGEX.exec(intent)?.[1]?.toLowerCase();

  const url = getBaseUrl();
  const search = url.searchParams;
  search.set('inApp', 'true');
  search.set('vs', '9'); // Voice System is VOICE_SYSTEM_LG_THINKQ
  if (voiceContentIntent) search.set('va', voiceContentIntent);

  // order is important
  search.append('launch', 'voice');
  if (voiceContentIntent === 'search') search.append('launch', 'search');

  search.set('vq', query);
  return url.toString();
}

/**
 * The YouTube URL a launch with `params` should open, or `null` when the params carry no usable content target (absent, empty, over-long, malformed, or a URL outside youtube.com).
 */
export function buildLaunchUrl(params: unknown): string | null {
  const contentTarget = contentTargetOf(params);

  if (typeof contentTarget === 'string') {
    if (
      contentTarget.length === 0 ||
      contentTarget.length > MAX_TARGET_LENGTH
    ) {
      return null;
    }

    // Protocol-relative URLs are never a query string.
    if (contentTarget.startsWith('//')) return null;

    // Anything with a scheme (javascript:, data:, mailto:, ...) is a URL and must stay on youtube.com; the rest is a query string.
    if (URL_SCHEME_REGEX.test(contentTarget)) {
      try {
        const direct = new URL(contentTarget);
        return direct.protocol === 'https:' &&
          direct.origin === getBaseUrl().origin
          ? direct.toString()
          : null;
      } catch {
        return null;
      }
    }
    return urlForQuery(contentTarget);
  }

  if (isRecord(contentTarget)) return urlForVoice(contentTarget);

  return null;
}
