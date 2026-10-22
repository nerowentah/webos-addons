import { configAddChangeListener, configRead } from '../config/config';
import { getVideo, isWatchPage } from '../core/utils';
import { cssString, formatTime } from '../core/format';
import './time-remaining.css';

// "-41:58 · ends 21:45" under the seek bar, written as a pseudo-element rule (a
// real node would be deleted by incremental-dom); ticks once a second while controls show.

const TIME_SELECTOR = '[idomkey="time-label"] [idomkey="duration"]::before';
const BAR_SELECTOR =
  'ytlr-progress-bar, ytlr-multi-markers-player-bar-renderer';
const TICK_MS = 1000;

let styleEl: HTMLStyleElement | null = null;
let css = '';
let timer: ReturnType<typeof setInterval> | null = null;
let endFormatter: Intl.DateTimeFormat | null = null;

function write(next: string): void {
  if (next === css && (!next || (styleEl && styleEl.isConnected))) return;
  css = next;
  if (!styleEl || !styleEl.isConnected) {
    if (!next) return;
    styleEl = document.createElement('style');
    styleEl.id = 'ytx-time-remaining';
    (document.head || document.documentElement).appendChild(styleEl);
  }
  styleEl.textContent = next;
}

/** The controls are up: the time label exists and the seek bar is not hidden. */
function controlsVisible(): boolean {
  if (!document.querySelector('[idomkey="time-label"]')) return false;
  const bar = document.querySelector<HTMLElement>(BAR_SELECTOR);
  return (
    !bar ||
    !(bar.classList.contains('zylon-hidden') || bar.style.opacity === '0')
  );
}

function formatEnd(ms: number): string {
  endFormatter ??= new Intl.DateTimeFormat(navigator.language, {
    hour: 'numeric',
    minute: 'numeric'
  });
  return endFormatter.format(new Date(ms));
}

/** The rule for the video's current position, or '' when there is nothing to show. */
function buildCss(
  duration: number,
  currentTime: number,
  playbackRate: number,
  now: number
): string {
  if (!(duration > 0) || !isFinite(duration) || isNaN(currentTime)) return '';
  const remaining =
    Math.max(0, duration - currentTime) / (playbackRate > 0 ? playbackRate : 1);
  const text = `-${formatTime(remaining)} · ends ${formatEnd(now + remaining * 1000)}`;
  return `${TIME_SELECTOR}{content:${cssString(text)};}`;
}

function tick(): void {
  if (!controlsVisible()) return;
  const video = getVideo();
  write(
    video
      ? buildCss(
          video.duration,
          video.currentTime,
          video.playbackRate,
          Date.now()
        )
      : ''
  );
}

function sync(): void {
  const on = configRead('showTimeRemaining') && isWatchPage();
  if (on && !timer) {
    timer = setInterval(tick, TICK_MS);
    tick();
  } else if (!on && timer) {
    clearInterval(timer);
    timer = null;
    write('');
  }
}

window.addEventListener('ytx-page-update', sync);
configAddChangeListener('showTimeRemaining', sync);
sync();
