/**
 * Manual device gate (not wired into CI): deploy, then assert on the TV.
 *
 *   npm run verify:device [-- -d <device>] [--skip-deploy]
 *
 * `-d`/`--device` may also come from YTX_DEVICE.
 *
 * Checks: app rendered, no broken images, single <video>, Back closes an open
 * settings overlay without navigating or throwing, and <video> advances after
 * `ok`. Record the build sha, TV model and webOS version in the PR.
 */
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, diagnostics, runCli, HarnessError } from './inspect.ts';
import { press, click } from './drive.ts';
import { deviceArg } from './args.ts';

const APP_DIR = fileURLToPath(new URL('../..', import.meta.url));
const argv = process.argv.slice(2);

let device: string | undefined;
try {
  device = deviceArg(argv);
} catch (error) {
  console.error(`verify:device: ${(error as Error).message}`);
  process.exit(1);
}

const failures: string[] = [];
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

runCli(async () => {
  if (!argv.includes('--skip-deploy')) {
    const r = spawnSync(
      process.execPath,
      [
        join(APP_DIR, 'tools/device/deploy.ts'),
        ...(device === undefined ? [] : ['-d', device])
      ],
      { cwd: APP_DIR, stdio: 'inherit' }
    );
    if (r.status !== 0) throw new HarnessError('deploy failed');
    await sleep(8000);
  }
  const session = await connect({ device });
  try {
    /* eslint-disable no-await-in-loop -- polling */
    for (let i = 0; i < 20; i++) {
      if ((await diagnostics(session)).appRendered) break;
      await sleep(1000);
    }
    /* eslint-enable no-await-in-loop */
    const base = await diagnostics(session);
    check(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare -- device data: absent must not read as true
      base.appRendered === true,
      'app rendered (ytlr-app)'
    );
    check(
      base.visibility === 'visible',
      `app is in the foreground (${base.visibility}); run ares-launch if hidden`
    );
    check(base.brokenImages === 0, `no broken images (${base.brokenImages})`);
    check(base.videos <= 1, 'single <video> pipeline');

    // Playback smoke first: pressing Back on the root screen can leave the app,
    // which would make a later playback check fail for the wrong reason.
    // Screenshots cannot show the video plane, so the clock is the probe.
    if (!base.video || base.video.paused || base.video.currentTime === 0) {
      // Home focuses the hero preview, where OK does not start playback; step to a tile first.
      await press(session, 'down');
      await press(session, 'ok');
    }
    /* eslint-disable no-await-in-loop -- polling for playback to start */
    let playing = base;
    for (let i = 0; i < 10; i++) {
      playing = await diagnostics(session);
      if (
        playing.video &&
        !playing.video.paused &&
        playing.video.currentTime > 0
      ) {
        break;
      }
      await sleep(1000);
    }
    /* eslint-enable no-await-in-loop */
    const t0 = playing.video?.currentTime;
    await sleep(3000);
    const t1 = (await diagnostics(session)).video?.currentTime;
    check(
      typeof t0 === 'number' && typeof t1 === 'number' && t1 > t0,
      `video advances (${t0} -> ${t1})`
    );

    // Bug path: Back with the overlay open must close it and stay on the page.
    // The pre-fix build only matched key === 'Back', which the remote does not
    // report on every engine; this is the regression gate for that.
    const urlBefore = (await diagnostics(session)).url;
    await click(session, '.ytx-ui-badge');
    const opened = await diagnostics(session);
    check(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare -- device data: absent must not read as true
      opened.settingsOverlayOpen === true,
      'badge opens the settings overlay'
    );

    await press(session, 'back');
    const afterOpenBack = await diagnostics(session);
    check(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare -- device data: absent must not read as closed
      afterOpenBack.settingsOverlayOpen === false,
      'Back closes the settings overlay'
    );
    check(
      afterOpenBack.url === urlBefore,
      'Back does not navigate the page away'
    );

    // Failure path: Back with no overlay must not throw or open the overlay.
    // It may leave the app (visible -> hidden), so nothing is asserted after it.
    await press(session, 'back');
    const afterBack = await diagnostics(session);
    check(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare -- device data: absent must not read as closed
      afterBack.settingsOverlayOpen === false,
      'Back leaves overlay closed'
    );
    check(
      !session.log.some((l) => l.startsWith('exception:')),
      'no uncaught page exceptions'
    );
  } finally {
    session.close();
  }
  if (failures.length) {
    throw new HarnessError(`${failures.length} check(s) failed`);
  }
  console.log('verify:device OK');
});
