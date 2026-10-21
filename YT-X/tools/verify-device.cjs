'use strict';
/**
 * Manual device gate (not wired into CI): deploy, then assert on the TV.
 *
 *   npm run verify:device [-- -d <device>] [--skip-deploy]
 *
 * Checks: app rendered, no broken images, single <video>, Back leaves the
 * overlay closed without page exceptions, and <video> advances after `ok`.
 * Record the build sha, TV model and webOS version in the PR.
 */
const { spawnSync } = require('node:child_process');
const { connect, diagnostics, runCli, HarnessError } = require('./inspect.cjs');
const { press, sleep } = require('./drive.cjs');

const argv = process.argv.slice(2);
const di = argv.indexOf('-d');
const device = di >= 0 ? argv.splice(di, 2)[1] : undefined;

/** @type {string[]} */
const failures = [];
/** @param {boolean} ok @param {string} label */
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

runCli(async () => {
  if (!argv.includes('--skip-deploy')) {
    const r = spawnSync(process.execPath, ['tools/deploy.js'], {
      stdio: 'inherit'
    });
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
    check(base.appRendered === true, 'app rendered (ytlr-app)');
    check(base.brokenImages === 0, `no broken images (${base.brokenImages})`);
    check(base.videos <= 1, 'single <video> pipeline');

    // Failure path: Back with no overlay must not throw or open the overlay.
    await press(session, 'back');
    const afterBack = await diagnostics(session);
    check(
      afterBack.settingsOverlayOpen === false,
      'Back leaves overlay closed'
    );
    check(
      !session.log.some((l) => l.startsWith('exception:')),
      'no uncaught page exceptions'
    );

    await press(session, 'ok');
    const t0 = (await diagnostics(session)).video?.currentTime;
    await sleep(3000);
    const t1 = (await diagnostics(session)).video?.currentTime;
    check(
      typeof t0 === 'number' && t1 > t0,
      `video advances after ok (${t0} -> ${t1})`
    );
  } finally {
    session.close();
  }
  if (failures.length) {
    throw new HarnessError(`${failures.length} check(s) failed`);
  }
  console.log('verify:device OK');
});
