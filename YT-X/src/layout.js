// Sections opt into the grid; three columns only past six rows (shorter sections
// read better two-up). `labelCount` excludes full-width cycle-control rows.
export const THREE_COL_MIN_ROWS = 6;

/**
 * @param {number} labelCount Column-eligible rows in the section.
 * @returns {2 | 3} Number of columns to lay the section out in.
 */
export function gridColumns(labelCount) {
  return labelCount >= THREE_COL_MIN_ROWS ? 3 : 2;
}
