// When Back at the YouTube TV root should ask to close the app instead of being
// handed to the page. DOM-free so it is unit-testable.

/** Home: the bare app URL, with or without a query; sub-pages carry a route (#/watch, #/search, #/browse, ...). */
const ROOT_HASH = /^#?\/?(?:\?.*)?$/;

export interface ExitOnBackState {
  panelVisible: boolean;
  /** `location.hash` of the page. */
  hash: string;
}

export function shouldExitOnBack(state: ExitOnBackState): boolean {
  return !state.panelVisible && ROOT_HASH.test(state.hash);
}
