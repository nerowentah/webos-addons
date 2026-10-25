// Pure accessibility attribute helpers for the options panel. Kept free of the
// DOM so the roles, ids and values are unit-tested (tools/a11y.test.ts).

/** Ids of the five settings pages, by tab index (Main, UI, System, Privacy, Adblock). */
export const PAGE_IDS = [
  'ytx-page-main',
  'ytx-page-ui-tweaks',
  'ytx-page-system',
  'ytx-page-privacy',
  'ytx-page-sponsor'
] as const;

export const PANEL_TITLE_ID = 'ytx-panel-title';

export const tabId = (index: number): string => `ytx-tab-${index}`;

/**
 * Attributes of one tab button. Every tab stays tabIndex 0 (set by the
 * caller): the D-pad navigator only visits tabIndex >= 0 elements, so a roving
 * tabindex would make the inactive tabs unreachable.
 */
export function tabAttrs(
  index: number,
  selected: boolean
): Record<string, string> {
  return {
    role: 'tab',
    id: tabId(index),
    'aria-controls': PAGE_IDS[index] ?? '',
    'aria-selected': selected ? 'true' : 'false'
  };
}

/** Attributes of one settings page. */
export function pageAttrs(index: number): Record<string, string> {
  return { role: 'tabpanel', 'aria-labelledby': tabId(index) };
}

let sectionSeq = 0;

/** A fresh id for a section heading; the counter is module-wide, so ids never repeat. */
export function nextSectionHeadingId(): string {
  sectionSeq += 1;
  return `ytx-section-${sectionSeq}-title`;
}

/**
 * Value attributes of a cycle row exposed as a spinbutton. `aria-valuenow` is
 * an index, so it is always paired with the visible text as `aria-valuetext`.
 * Up/Down move focus in the panel instead of changing the value (Left/Right
 * and Enter/Space cycle); WCAG prescribes no keys for this.
 */
export function cycleValueAttrs(
  index: number,
  count: number,
  text: string
): Record<string, string> {
  return {
    'aria-valuemin': '0',
    'aria-valuemax': String(Math.max(0, count - 1)),
    'aria-valuenow': String(Math.max(0, index)),
    'aria-valuetext': text
  };
}
