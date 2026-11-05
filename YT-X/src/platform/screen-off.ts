// Screen off while audio keeps playing; any remote key wakes it. With the Luna
// bridge the TV powers its panel down. The native Cobalt build has no bridge, so
// there a full-screen black layer stands in: the panel stays lit but shows black
// (the backlight is not switched off) and playback is left running.

import { isSyntheticKey } from '../core/keys';
import { hasPalmBridge, lunaCall, TVPOWER_URI } from './luna';

/** Ignore input this long after the layer appears, so the press that chose "Screen Off" does not wake it. */
const WAKE_GRACE_MS = 600;

let blackout: HTMLDivElement | null = null;

function hideBlackout(): void {
  blackout?.remove();
  blackout = null;
  window.removeEventListener('keydown', onWakeKey, true);
  window.removeEventListener('mousemove', onWakePointer, true);
}

let shownAt = 0;
const settled = (): boolean => Date.now() - shownAt >= WAKE_GRACE_MS;

function onWakeKey(evt: KeyboardEvent): void {
  if (isSyntheticKey(evt)) return;
  // Consumed so the key that wakes the screen does not also act on the UI.
  evt.preventDefault();
  evt.stopImmediatePropagation();
  if (settled()) hideBlackout();
}

function onWakePointer(): void {
  if (settled()) hideBlackout();
}

function showBlackout(): void {
  if (blackout) return;
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText =
    'position:fixed;left:0;top:0;width:100%;height:100%;background:#000;' +
    'z-index:2147483647;cursor:none;';
  document.body.appendChild(layer);
  blackout = layer;
  shownAt = Date.now();
  window.addEventListener('keydown', onWakeKey, true);
  window.addEventListener('mousemove', onWakePointer, true);
}

/** Whether the black layer is up; the Back remap leaves keys alone then so Back can wake the screen. */
export const isBlackedOut = (): boolean => blackout !== null;

/** Every build can black the screen; the Luna route only changes how. */
export function canTurnOffScreen(): boolean {
  return true;
}

/** @returns Whether the request was made; the TV may still refuse the Luna one. */
export function turnOffScreen(): boolean {
  if (hasPalmBridge()) {
    return lunaCall(TVPOWER_URI + 'turnOffScreen', {}) !== null;
  }
  showBlackout();
  return true;
}
