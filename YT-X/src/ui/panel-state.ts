// Shared mutable state of the options panel, so the modules that drive it do
// not need to import each other.

/** The options panel element plus the hooks the module drives it through. */
export interface OptionsPanel extends HTMLDivElement {
  activePage: number;
  ensurePage(index: number): void;
  buildDeferredPages(): void;
  recalcDensity(): void;
}

export const panelState: {
  panel: OptionsPanel | null;
  visible: boolean;
  /** Set briefly after first creation so a double activation cannot toggle it shut. */
  initBlock: boolean;
  lastSafeFocus: HTMLElement | null;
} = { panel: null, visible: false, initBlock: false, lastSafeFocus: null };

// Wired by sponsorblock.ts via setSponsorBlockPanelSync; no-op until then.
// The registered fn receives the panel-open state; the popup is suppressed
// while the panel is open.
let sponsorBlockPanelSync: (open: boolean) => void = () => {};
export const syncSponsorBlockPanel = (open: boolean): void =>
  sponsorBlockPanelSync(open);
export function setSponsorBlockPanelSync(fn: (open: boolean) => void): void {
  sponsorBlockPanelSync = fn;
}
