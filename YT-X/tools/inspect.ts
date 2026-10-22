/**
 * On-TV inspector: attaches to the running app over CDP via `ares-inspect`.
 *
 *   node tools/inspect.ts                 diagnostics JSON
 *   node tools/inspect.ts eval "<expr>"   evaluate in the page
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
import { spawn } from 'node:child_process';
import { normalize } from 'node:path';
import appinfo from '../assets/appinfo.json' with { type: 'json' };

const ARES_INSPECT = './node_modules/@webos-tools/cli/bin/ares-inspect.js';
const STARTUP_TIMEOUT_MS = 30_000;

export class HarnessError extends Error {}

/** A message from the DevTools protocol: a reply (`id`) or an event (`method`). */
interface CdpMessage {
  id?: number;
  result?: unknown;
  error?: { message: string };
  method?: string;
  params?: {
    type?: string;
    args?: { value?: unknown; description?: string }[];
    exceptionDetails?: ExceptionDetails;
  };
}

interface ExceptionDetails {
  text: string;
  exception?: { description?: string };
}

interface EvaluateResult {
  exceptionDetails?: ExceptionDetails;
  result: { value?: unknown; objectId?: string };
}

/** Diagnostics returned by the in-page probe, plus the harness's own additions. */
export interface Diagnostics {
  url: string;
  visibility: string;
  appRendered: boolean;
  domNodes: number;
  focusables: number;
  activeElement: string | null;
  brokenImages: number;
  videos: number;
  video: { currentTime: number; paused: boolean; readyState: number } | null;
  settingsOverlayOpen: boolean;
  metrics: Record<string, number>;
  recentLog: string[];
}

export interface Session {
  send(method: string, params?: object): Promise<unknown>;
  evaluate(expression: string): Promise<unknown>;
  callFunction(
    functionDeclaration: string,
    ...args: unknown[]
  ): Promise<unknown>;
  log: string[];
  close(): void;
}

/** Probe /json on the forwarded port and return the first page target's ws URL. */
async function findTarget(port: number): Promise<string> {
  let targets: { type?: string; webSocketDebuggerUrl?: string }[];
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`);
    targets = (await res.json()) as typeof targets;
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

function exceptionMessage(details: ExceptionDetails): string {
  return details.exception?.description ?? details.text;
}

/**
 * Start ares-inspect and connect. Resolves to a session; call close() when done.
 */
export async function connect({
  device
}: { device?: string | undefined } = {}): Promise<Session> {
  const args = [normalize(ARES_INSPECT), '-a', appinfo.id];
  if (device) args.push('-d', device);
  const child = spawn(process.execPath, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const port = await new Promise<number>((resolve, reject) => {
    let out = '';
    const timer = setTimeout(
      () =>
        reject(
          new HarnessError(`ares-inspect gave no port in time:\n${out.trim()}`)
        ),
      STARTUP_TIMEOUT_MS
    );
    const onData = (buf: Buffer) => {
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

  const ws = new WebSocket(await findTarget(port));
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new HarnessError('DevTools socket failed'));
  });

  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();
  const log: string[] = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data)) as CdpMessage;
    const waiting = msg.id === undefined ? undefined : pending.get(msg.id);
    if (msg.id !== undefined && waiting) {
      pending.delete(msg.id);
      if (msg.error) waiting.reject(new HarnessError(msg.error.message));
      else waiting.resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params?.args ?? [])
        .map((a) => a.value ?? a.description)
        .join(' ');
      log.push(`console.${msg.params?.type}: ${text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params?.exceptionDetails;
      log.push(`exception: ${d?.text} ${d?.exception?.description ?? ''}`);
    }
  };

  const send = (method: string, params: object = {}): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression: string): Promise<unknown> => {
    const r = (await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    })) as EvaluateResult;
    if (r.exceptionDetails) {
      throw new HarnessError(exceptionMessage(r.exceptionDetails));
    }
    return r.result.value;
  };

  /**
   * Call a function declaration in the page with JSON-serialisable arguments
   * passed as values, so nothing is spliced into evaluated source.
   */
  const callFunction = async (
    functionDeclaration: string,
    ...fnArgs: unknown[]
  ): Promise<unknown> => {
    const g = (await send('Runtime.evaluate', {
      expression: 'globalThis'
    })) as EvaluateResult;
    try {
      const r = (await send('Runtime.callFunctionOn', {
        functionDeclaration,
        objectId: g.result.objectId,
        arguments: fnArgs.map((value) => ({ value })),
        returnByValue: true,
        awaitPromise: true
      })) as EvaluateResult;
      if (r.exceptionDetails) {
        throw new HarnessError(exceptionMessage(r.exceptionDetails));
      }
      return r.result.value;
    } finally {
      await send('Runtime.releaseObject', { objectId: g.result.objectId });
    }
  };

  await send('Runtime.enable');
  await send('Performance.enable');

  return {
    send,
    evaluate,
    callFunction,
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
    visibility: document.visibilityState,
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

export async function diagnostics(session: Session): Promise<Diagnostics> {
  // The probe above is the schema; the harness adds `metrics` and `recentLog`.
  const state = (await session.evaluate(DIAGNOSTICS)) as Diagnostics;
  const { metrics } = (await session.send('Performance.getMetrics')) as {
    metrics: { name: string; value: number }[];
  };
  const keep = ['JSHeapUsedSize', 'Nodes', 'LayoutCount', 'Documents'];
  state.metrics = Object.fromEntries(
    metrics.filter((m) => keep.includes(m.name)).map((m) => [m.name, m.value])
  );
  state.recentLog = session.log.slice(-20);
  return state;
}

/** Shared CLI wrapper: clean message instead of a stack trace. */
export function runCli(main: () => Promise<void>): void {
  main().catch((err: unknown) => {
    const kind = err instanceof HarnessError ? 'error' : 'unexpected error';
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${kind}: ${message}`);
    process.exit(1);
  });
}

if (import.meta.main) {
  runCli(async () => {
    const argv = process.argv.slice(2);
    const di = argv.indexOf('-d');
    const device = di >= 0 ? argv.splice(di, 2)[1] : undefined;
    const session = await connect({ device });
    try {
      if (argv[0] === 'eval') {
        if (!argv[1]) {
          throw new HarnessError('usage: inspect.ts eval "<expression>"');
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
