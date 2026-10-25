// Records how an app identifies itself to YouTube and Google, with every
// credential redacted, so two builds can be compared field by field.
//
//   node tools/native/capture-identity.ts --label webos [--seconds 240] [-d tv]
//   node tools/native/capture-identity.ts --label native --port 9222   (forwarded debug port)
//
// Start it, then sign in on the TV (phone code flow). It writes
// dist/identity-<label>.md. Use --seconds 0 for the page's
// identity dump only.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  connect,
  connectToWebSocket,
  runCli,
  HarnessError,
  type Session
} from '../device/inspect.ts';
import {
  IDENTITY_DUMP,
  recorderSource,
  redactIdentity,
  redactRequest,
  type RawRequest,
  type RedactedRequest
} from './identity-capture.ts';

const POLL_MS = 2000;

function option(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

async function install(session: Session): Promise<void> {
  const source = recorderSource();
  // New documents (web app reloads after sign-in) get it before their own scripts run.
  try {
    await session.send('Page.addScriptToEvaluateOnNewDocument', { source });
  } catch {
    // Cobalt's debugger has no such command; the evaluate below is enough.
  }
  await session.evaluate(source);
}

async function drain(session: Session): Promise<RawRequest[]> {
  await session.evaluate(recorderSource()); // idempotent; covers a swapped document
  const json = (await session.evaluate(
    'JSON.stringify((window.__ytxCapture || []).splice(0))'
  )) as string;
  return JSON.parse(json) as RawRequest[];
}

interface Dump {
  userAgent: string;
  client: Record<string, unknown>;
}

function markdown(
  label: string,
  dump: Dump,
  requests: readonly RedactedRequest[]
): string {
  const rows = Object.entries(redactIdentity(dump.client))
    .map(([key, value]) => `| ${key} | ${JSON.stringify(value)} |`)
    .join('\n');
  const blocks = requests
    .map(
      (r) =>
        `### ${r.method} ${r.host}${r.path}\n\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\``
    )
    .join('\n\n');
  return `# Identity capture: ${label}

Captured ${new Date().toISOString()}. Credentials are redacted by
\`tools/native/identity-capture.ts\`.

## User agent

\`${dump.userAgent}\`

## InnerTube client context

| Field | Value |
| --- | --- |
${rows}

## Sign-in and account requests (${requests.length})

${blocks || '_none recorded_'}
`;
}

runCli(async () => {
  const argv = process.argv.slice(2);
  const label = option(argv, '--label');
  if (!label)
    throw new HarnessError('usage: capture-identity.ts --label <name>');
  const seconds = Number(option(argv, '--seconds') ?? '240');
  const port = option(argv, '--port');
  const device = option(argv, '-d');
  const out =
    option(argv, '--out') ??
    fileURLToPath(new URL(`../../dist/identity-${label}.md`, import.meta.url));

  const session = port
    ? await connectToWebSocket(`ws://127.0.0.1:${port}/`)
    : await connect({ device });
  try {
    await install(session);
    const dump = JSON.parse(
      (await session.evaluate(IDENTITY_DUMP)) as string
    ) as Dump;
    console.log(`user agent: ${dump.userAgent}`);

    const seen: RedactedRequest[] = [];
    const deadline = Date.now() + seconds * 1000;
    if (seconds > 0)
      console.log(`recording for ${seconds}s: sign in on the TV now`);
    /* eslint-disable no-await-in-loop -- sequential polling */
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      try {
        for (const raw of await drain(session)) {
          const entry = redactRequest(raw);
          seen.push(entry);
          console.log(`  ${entry.method} ${entry.host}${entry.path}`);
        }
      } catch (error) {
        // A dropped connection must not lose what was already recorded.
        console.error(`connection lost: ${(error as Error).message}`);
        break;
      }
      // Written after every batch, so an interrupted run still leaves its data.
      if (seen.length > 0) writeFileSync(out, markdown(label, dump, seen));
    }
    /* eslint-enable no-await-in-loop */

    writeFileSync(out, markdown(label, dump, seen));
    console.log(`wrote ${out}`);
  } finally {
    session.close();
  }
});
