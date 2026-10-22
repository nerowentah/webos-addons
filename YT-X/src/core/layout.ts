// Sections opt into the grid; three columns only past six rows (shorter sections
// read better two-up). `labelCount` excludes full-width cycle-control rows.
export const THREE_COL_MIN_ROWS = 6;

/** Number of columns to lay a section with `labelCount` column-eligible rows out in. */
export function gridColumns(labelCount: number): 2 | 3 {
  return labelCount >= THREE_COL_MIN_ROWS ? 3 : 2;
}
