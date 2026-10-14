/**
 * Settings-grid column rule.
 *
 * Sections opt into the grid; this decides whether they lay out two or three
 * columns. Kept in its own DOM-free module so it can be unit-tested in plain
 * Node (see tools/layout.test.cjs) without pulling in ui.css or the DOM.
 *
 * Why three only past a threshold: a section with a handful of rows reads
 * better two-up (wider cells, easier scanning), while a long list three-up
 * saves the vertical scroll that the panel has to trim around. Six rows is the
 * point where the extra column stops looking sparse.
 *
 * The count passed in is column-eligible rows only - cycle-control rows span
 * the full width and are never grid cells, so they must not be counted.
 */
export const THREE_COL_MIN_ROWS = 6;

/**
 * @param {number} labelCount Column-eligible rows in the section.
 * @returns {2 | 3} Number of columns to lay the section out in.
 */
export function gridColumns(labelCount) {
  return labelCount >= THREE_COL_MIN_ROWS ? 3 : 2;
}
