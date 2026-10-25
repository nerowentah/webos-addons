/**
 * Send remote-control keys to the running app over CDP and print diagnostics.
 *
 *   node tools/device/drive.ts "down,down,ok" [shot.png] [-d <device>]
 *
 * Tokens: up down left right ok back red green yellow blue.
 * Back is keyCode 461 (not Backspace); colour keys are 403-406.
 * Screenshots exclude the hardware video plane (see inspect.ts).
 */
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  connect,
  diagnostics,
  runCli,
  HarnessError,
  type Session
} from './inspect.ts';

const SETTLE_MS = 450;

const KEYS: Record<string, { code: number; key: string; domCode: string }> = {
  up: { code: 38, key: 'ArrowUp', domCode: 'ArrowUp' },
  down: { code: 40, key: 'ArrowDown', domCode: 'ArrowDown' },
  left: { code: 37, key: 'ArrowLeft', domCode: 'ArrowLeft' },
  right: { code: 39, key: 'ArrowRight', domCode: 'ArrowRight' },
  ok: { code: 13, key: 'Enter', domCode: 'Enter' },
  back: { code: 461, key: 'GoBack', domCode: '' },
  red: { code: 403, key: 'ColorF0Red', domCode: '' },
  green: { code: 404, key: 'ColorF1Green', domCode: '' },
  yellow: { code: 405, key: 'ColorF2Yellow', domCode: '' },
  blue: { code: 406, key: 'ColorF3Blue', domCode: '' }
};

export async function press(session: Session, token: string): Promise<void> {
  const k = KEYS[token];
  if (!k) {
    throw new HarnessError(
      `unknown key "${token}"; use ${Object.keys(KEYS).join(', ')}`
    );
  }
  const base = {
    key: k.key,
    code: k.domCode,
    windowsVirtualKeyCode: k.code,
    nativeVirtualKeyCode: k.code
  };
  await session.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(SETTLE_MS);
}

/**
 * Click an element with trusted input. In-page `el.click()` does not drive the
 * app's listeners on webOS, so pointer-driven UI has to go through the protocol.
 */
export async function click(session: Session, selector: string): Promise<void> {
  const rect = (await session.callFunction(
    'function (selector) { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }',
    selector
  )) as { x: number; y: number } | null;
  if (!rect) throw new HarnessError(`no element matches ${selector}`);
  const base = { ...rect, button: 'left', buttons: 1, clickCount: 1 };
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    ...base
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...base
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...base
  });
  await sleep(SETTLE_MS);
}

if (import.meta.main) {
  runCli(async () => {
    const argv = process.argv.slice(2);
    const di = argv.indexOf('-d');
    const device = di >= 0 ? argv.splice(di, 2)[1] : undefined;
    const [keys, shot] = argv;
    if (!keys) {
      throw new HarnessError(
        'usage: drive.ts "down,down,ok" [shot.png] [-d device]'
      );
    }
    const session = await connect({ device });
    try {
      /* eslint-disable no-await-in-loop -- keys must be sent in order */
      for (const token of keys
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)) {
        await press(session, token);
      }
      /* eslint-enable no-await-in-loop */
      if (shot) {
        const { data } = (await session.send('Page.captureScreenshot', {
          format: 'png'
        })) as { data: string };
        writeFileSync(shot, Buffer.from(data, 'base64'));
      }
      console.log(JSON.stringify(await diagnostics(session), null, 2));
    } finally {
      session.close();
    }
  });
}
