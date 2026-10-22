/**
 * On-TV snapshot producer for the Chrome comparison: attaches to the running
 * app over CDP, holds the player at one frame and writes the same Snapshot
 * JSON that `compare-chrome.ts --tv <file>` diffs against.
 *
 *   node tools/compare-tv.ts [--time 102] [--out <dir>] [-d <device>]
 *
 * Start a video on the TV first; this tool does not navigate.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  collectSnapshot,
  DEFAULT_TIME_S,
  seekAndPause,
  sleep,
  VIEWPORT,
  waitFor
} from './compare-chrome.ts';
import { press } from './drive.ts';
import { connect, HarnessError, runCli } from './inspect.ts';

const TIMEOUT_MS = 30_000;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      time: { type: 'string', default: String(DEFAULT_TIME_S) },
      out: { type: 'string' },
      d: { type: 'string', short: 'd' }
    }
  });
  const timeS = Number(values.time);
  if (!(timeS >= 0)) {
    throw new HarnessError('--time must be a number of seconds >= 0');
  }
  const out = values.out ?? join(tmpdir(), 'ytx-chrome-compare');
  await mkdir(out, { recursive: true });

  const session = await connect({ device: values.d });
  try {
    const frame = await seekAndPause(session, timeS, TIMEOUT_MS);
    const barUp = () =>
      session.evaluate(
        "!!document.querySelector('ytlr-player-actions-container')"
      ) as Promise<boolean>;
    await waitFor('the control bar', TIMEOUT_MS, async () => {
      if (await barUp()) return true;
      await press(session, 'down');
      return false;
    });
    await sleep(800);

    const snapshot = await collectSnapshot(session);
    const file = join(out, 'tv.json');
    await writeFile(
      file,
      JSON.stringify({ viewport: VIEWPORT, timeS, frame, snapshot }, null, 2)
    );
    console.log(`TV snapshot written: ${file}`);
    console.log(
      `Compare with: node tools/compare-chrome.ts --time ${timeS} --tv "${file}"`
    );
  } finally {
    session.close();
  }
}

runCli(main);
