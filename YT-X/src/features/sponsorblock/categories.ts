import type { BoolKey } from '../../config/config';

/**
 * The single SponsorBlock category table. Order is the API/display order.
 * Colors are fixed (shared by the progress-bar overlay and the popup so the two
 * surfaces agree; not user-configurable). `skipName` reads in "Skipped <name>".
 * Popup labels live in config/ui-text.ts, typed against these ids.
 */
export const SEGMENT_CATEGORIES = [
  {
    id: 'sponsor',
    color: '#00d400',
    configKey: 'enableSponsorBlockSponsor',
    skipName: 'sponsored segment'
  },
  {
    id: 'intro',
    color: '#00ffff',
    configKey: 'enableSponsorBlockIntro',
    skipName: 'intro'
  },
  {
    id: 'outro',
    color: '#0202ed',
    configKey: 'enableSponsorBlockOutro',
    skipName: 'outro'
  },
  {
    id: 'interaction',
    color: '#cc00ff',
    configKey: 'enableSponsorBlockInteraction',
    skipName: 'interaction reminder'
  },
  {
    id: 'selfpromo',
    color: '#ffff00',
    configKey: 'enableSponsorBlockSelfPromo',
    skipName: 'self-promotion'
  },
  {
    id: 'music_offtopic',
    color: '#ff9900',
    configKey: 'enableSponsorBlockMusicOfftopic',
    skipName: 'non-music part'
  },
  {
    id: 'preview',
    color: '#008fd6',
    configKey: 'enableSponsorBlockPreview',
    skipName: 'recap or preview'
  },
  {
    id: 'poi_highlight',
    color: '#ff1684',
    configKey: 'enableSponsorBlockHighlight',
    skipName: 'highlight'
  },
  {
    id: 'filler',
    color: '#7300ff',
    configKey: 'enableSponsorBlockFiller',
    skipName: 'tangents/jokes'
  },
  {
    id: 'hook',
    color: '#395699',
    configKey: 'enableSponsorBlockHook',
    skipName: 'hook/greetings'
  }
] as const satisfies readonly {
  id: string;
  color: string;
  configKey: BoolKey;
  skipName: string;
}[];

export type SegmentCategory = (typeof SEGMENT_CATEGORIES)[number]['id'];

interface CategoryInfo {
  readonly color: string;
  readonly configKey: BoolKey;
  readonly skipName: string;
}

const byId = new Map<string, CategoryInfo>(
  SEGMENT_CATEGORIES.map((c) => [c.id, c])
);

/** The table row for an API category string, or undefined for one we do not know. */
export function categoryInfo(category: string): CategoryInfo | undefined {
  return byId.get(category);
}
