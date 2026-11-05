// When Back at the YouTube TV root should close the app instead of being sent on
// as Escape. DOM-free so it is unit-testable.

/** Home: the bare app URL, with or without a query; sub-pages carry a route (#/watch, #/search, #/browse, ...). */
const ROOT_HASH = /^#?\/?(?:\?.*)?$/;

export interface ExitOnBackState {
  /** The "Fully Close on Exit" setting. */
  enabled: boolean;
  panelVisible: boolean;
  /** `location.hash` of the page. */
  hash: string;
}

export function shouldExitOnBack(state: ExitOnBackState): boolean {
  return state.enabled && !state.panelVisible && ROOT_HASH.test(state.hash);
}
