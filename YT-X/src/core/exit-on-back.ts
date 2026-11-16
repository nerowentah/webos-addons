// When Back at the YouTube TV root should ask to close the app instead of being
// handed to the page. DOM-free so it is unit-testable.

/** Home: the bare app URL, with or without a query; sub-pages carry a route (#/watch, #/search, #/browse, ...). */
const ROOT_HASH = /^#?\/?(?:\?.*)?$/;

export interface ExitOnBackState {
  panelVisible: boolean;
  /** `location.hash` of the page. */
  hash: string;
  /**
   * Whether the body reports a player page (watch or shorts). The hash can
   * read as root while a video plays, and then Back belongs to the player,
   * not to the exit dialog.
   */
  onPlayerPage: boolean;
}

export function shouldExitOnBack(state: ExitOnBackState): boolean {
  return (
    !state.panelVisible && !state.onPlayerPage && ROOT_HASH.test(state.hash)
  );
}
