// Pure panel classification, kept free of DOM access so it can be unit-tested.

/**
 * Panel type, from the platform where it will say and the model string where
 * it will not (no luna bridge in the webview; $modelName$ is in the UA).
 */
export type PanelType = 'oled' | 'qned' | 'lcd' | 'unknown';

/** Groups after a size in an LG part number, e.g. the "C1" in "OLED55C14PUA". */
const LG_FAMILY_TOKENS = /\d([A-Z]+)\d*/g;

/**
 * LG OLED panel family codes. Only consulted when the platform flag is
 * undefined (older webOS); a non-OLED set with a matching part number can be
 * misread, so this is a fallback, never the primary answer.
 */
const OLED_FAMILY_PREFIXES = new Set([
  'A',
  'B',
  'C',
  'E',
  'G',
  'W',
  'CS',
  'CX',
  'EG',
  'EW',
  'GX',
  'WO'
]);

function matchesOLEDFamilyCode(head: string): boolean {
  LG_FAMILY_TOKENS.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LG_FAMILY_TOKENS.exec(head)) !== null) {
    const group = match[1] ?? '';
    if (
      OLED_FAMILY_PREFIXES.has(group.slice(0, 2)) ||
      OLED_FAMILY_PREFIXES.has(group.slice(0, 1))
    ) {
      return true;
    }
  }
  return false;
}

export function parsePanelType(
  model: string | undefined,
  oledFromPlatform: boolean | undefined
): PanelType {
  const headRaw = model?.toUpperCase();
  const head = headRaw?.replace(/[\s_-]+/g, '');

  // QNED/MiniLED are not exposed by the platform at all, and a QNED part
  // number can carry an OLED-like family group, so the model string is first.
  if (
    head !== undefined &&
    (head.includes('QNED') || head.includes('MINILED'))
  ) {
    return 'qned';
  }

  // The platform states OLED outright and knows better than any part-number
  // pattern; explicit `false` is authoritative too (it means LCD).
  if (oledFromPlatform !== undefined) {
    return oledFromPlatform ? 'oled' : 'lcd';
  }

  // Undefined: older webOS without the property; guess from the model
  // ("55NANO8PUA" lands here and correctly misses).
  if (head !== undefined) {
    if (head.includes('OLED')) return 'oled';
    if (matchesOLEDFamilyCode(head)) return 'oled';
  }

  return 'lcd';
}

/**
 * The panel care mode a stored choice and detected panel resolve to: an explicit stored choice wins, else
 * 'auto' maps the panel; an unclassifiable panel resolves to 'off' — the safe
 * direction rather than a treatment tuned for the wrong panel.
 */
export function resolvePanelCareMode(
  stored: string,
  panel: PanelType
): 'oled' | 'qned' | 'off' {
  if (stored === 'oled' || stored === 'qned' || stored === 'off') return stored;

  if (panel === 'oled') return 'oled';
  if (panel === 'qned') return 'qned';
  return 'off';
}
