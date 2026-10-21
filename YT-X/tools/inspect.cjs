'use strict';
/**
 * On-TV inspector: attaches to the running app over CDP via `ares-inspect`.
 *
 *   node tools/inspect.cjs                 diagnostics JSON
 *   node tools/inspect.cjs eval "<expr>"   evaluate in the page
 *   (add `-d <device>` anywhere to pick an ares device)
 *
 * Gotchas:
 *  - Screenshots cannot capture the hardware video plane; assert playback via
 *    <video>.currentTime advancing instead.
 *  - Keys sent through CDP Input.dispatchKeyEvent are trusted, so they pass the
 *    repo's synthetic-event guards. In-page dispatchEvent does not.
 *  - If results look implausible (0 focusables on a rendered page), suspect the
 *    harness before the app.
 */
const { spawn } = require('node:child_process');
const { normalize } = require('node:path');
const appinfo = require('../assets/appinfo.json');

const ARES_INSPECT = './node_modules/@webos-tools/cli/bin/ares-inspect.js';
const STARTUP_TIMEOUT_MS = 30_000;

class HarnessError extends Error {}

/** Probe /json on the forwarded port and return the first page target's ws URL. */
/** @param {number} port */
async function findTarget(port) {
  /** @type {{type?: string, webSocketDebuggerUrl?: string}[]} */
  let targets;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`);
    targets = /** @type {typeof targets} */ (await res.json());
  } catch {
    throw new HarnessError(
      `nothing answered on the forwarded inspector port ${port}. Is the device reachable and the app running?`
    );
  }
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) {
    throw new HarnessError('inspector is up but no page target was found');
  }
  return page.webSocketDebuggerUrl;
}

/**
 * Start ares-inspect and connect. Resolves to a session; call close() when done.
 * @param {{device?: string | undefined}} [opts]
 */
async function connect({ device } = {}) {
  const args = [normalize(ARES_INSPECT), '-a', appinfo.id];
  if (device) args.push('-d', device);
  const child = spawn(process.execPath, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const port = await new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(
      () =>
        reject(
          new HarnessError(`ares-inspect gave no port in time:\n${out.trim()}`)
        ),
      STARTUP_TIMEOUT_MS
    );
    const onData = (/** @type {Buffer} */ buf) => {
      out += buf;
      const m = /(?:127\.0\.0\.1|localhost):(\d{2,5})/.exec(out);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', () => {
      clearTimeout(timer);
      reject(
        new HarnessError(
          `ares-inspect exited. Is the device set up and the app running?\n${out.trim()}`
        )
      );
    });
  });

  const ws = new WebSocket(await findTarget(Number(port)));
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new HarnessError('DevTools socket failed'));
  });

  let nextId = 1;
  /** @type {Map<number, {resolve: Function, reject: Function}>} */
  const pending = new Map();
  /** @type {string[]} */
  const log = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p?.reject(new HarnessError(msg.error.message));
      else p?.resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args
        .map((/** @type {any} */ a) => a.value ?? a.description)
        .join(' ');
      log.push(`console.${msg.params.type}: ${text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      log.push(`exception: ${d.text} ${d.exception?.description ?? ''}`);
    }
  };

  /** @param {string} method @param {object} [params] */
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  /** @param {string} expression */
  const evaluate = async (expression) => {
    const r = /** @type {any} */ (
      await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      })
    );
    if (r.exceptionDetails) {
      throw new HarnessError(
        r.exceptionDetails.exception?.description ?? r.exceptionDetails.text
      );
    }
    return r.result.value;
  };

  await send('Runtime.enable');
  await send('Performance.enable');

  return {
    send,
    evaluate,
    log,
    close() {
      ws.close();
      child.kill();
    }
  };
}

const DIAGNOSTICS = `(() => {
  const v = document.querySelector('video');
  const overlay = document.querySelector('.ytx-ui-container');
  return {
    url: location.href,
    appRendered: !!document.querySelector('ytlr-app'),
    domNodes: document.getElementsByTagName('*').length,
    focusables: document.querySelectorAll('[tabindex]').length,
    activeElement: document.activeElement && (document.activeElement.tagName + '.' + document.activeElement.className),
    brokenImages: [...document.images].filter((i) => i.complete && !i.naturalWidth).length,
    videos: document.querySelectorAll('video').length,
    video: v && { currentTime: v.currentTime, paused: v.paused, readyState: v.readyState },
    settingsOverlayOpen: !!overlay && overlay.style.display !== 'none'
  };
})()`;

/** @param {Awaited<ReturnType<typeof connect>>} session */
async function diagnostics(session) {
  const state = /** @type {Record<string, any>} */ (
    await session.evaluate(DIAGNOSTICS)
  );
  const { metrics } = /** @type {any} */ (
    await session.send('Performance.getMetrics')
  );
  const keep = ['JSHeapUsedSize', 'Nodes', 'LayoutCount', 'Documents'];
  state.metrics = Object.fromEntries(
    metrics
      .filter((/** @type {{name: string}} */ m) => keep.includes(m.name))
      .map((/** @type {{name: string, value: number}} */ m) => [
        m.name,
        m.value
      ])
  );
  state.recentLog = session.log.slice(-20);
  return state;
}

/** Shared CLI wrapper: clean message instead of a stack trace. */
/** @param {() => Promise<void>} main */
function runCli(main) {
  main().catch((err) => {
    const kind = err instanceof HarnessError ? 'error' : 'unexpected error';
    console.error(`${kind}: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { connect, diagnostics, runCli, HarnessError };

if (require.main === module) {
  runCli(async () => {
    const argv = process.argv.slice(2);
    const di = argv.indexOf('-d');
    const device = di >= 0 ? argv.splice(di, 2)[1] : undefined;
    const session = await connect({ device });
    try {
      if (argv[0] === 'eval') {
        if (!argv[1]) {
          throw new HarnessError('usage: inspect.cjs eval "<expression>"');
        }
        console.log(JSON.stringify(await session.evaluate(argv[1]), null, 2));
      } else {
        console.log(JSON.stringify(await diagnostics(session), null, 2));
      }
    } finally {
      session.close();
    }
  });
}
