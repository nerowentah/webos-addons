// Compile-time guard, checked by `npm run type-check` and never bundled.
// EventMapOf<PlayerManager> infers the event map structurally (matching the
// CustomEventTarget<infer U> shape), not through the `extends` clause, so a
// change to the class or to CustomEventTarget could silently degrade it to
// `never` or `unknown`.

import type { EventMapOf } from '../../core/custom-event-target';
import type { PlayerManager } from './manager';

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;

type Map = EventMapOf<PlayerManager>;

export type EventMapIsNotNever = Assert<
  Equals<[Map] extends [never] ? true : false, false>
>;
export type EventMapKeys = Assert<
  Equals<keyof Map, 'newVideo' | 'playbackStart'>
>;
export type NewVideoDetail = Assert<Equals<Map['newVideo']['detail'], string>>;
export type PlaybackStartDetail = Assert<
  Equals<Map['playbackStart']['detail'], undefined>
>;
