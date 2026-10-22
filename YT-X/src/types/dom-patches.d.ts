// Expando properties this app sets on, or reads from, YouTube's own DOM objects.

interface HTMLVideoElement {
  /** Set once keep-playing has hooked the element's pause handling. */
  __ytxPauseHooked?: boolean;
}

/** The slice of YouTube's component instance (`el.__instance`) the keyboard-search module drives. */
interface YtComponentInstance {
  onSelect?: (event: unknown) => void;
}

interface HTMLElement {
  __instance?: YtComponentInstance;
}

/** The SponsorBlock session for the current /watch page; a window property because a module-level `let` misbehaved on Chromium 38. */
interface SponsorBlockSession {
  videoID: string;
  init(): Promise<void>;
  destroy(): void;
}

interface Window {
  sponsorblock: SponsorBlockSession | null;
}
