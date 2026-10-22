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
