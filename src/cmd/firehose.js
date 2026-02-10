// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { loadEnv } from '../lib/env.js';

const JETSTREAM_URL = 'wss://jetstream2.us-east.bsky.network/subscribe';
const DEFAULT_COLLECTION = 'org.v-it.hello';

let ws = null;
let shuttingDown = false;
let backoff = 1000;

function buildUrl(collection, did, cursor) {
  const url = new URL(JETSTREAM_URL);
  url.searchParams.set('wantedCollections', collection);
  if (did) url.searchParams.set('wantedDids', did);
  if (cursor) url.searchParams.set('cursor', cursor);
  return url.toString();
}

function formatTime(timeUs) {
  return new Date(timeUs / 1000).toLocaleTimeString();
}

function formatEvent(event) {
  const time = formatTime(event.time_us);
  const didShort = typeof event.did === 'string' ? event.did.slice(-12) : 'unknown';

  if (event.kind === 'commit') {
    const operation = event.commit?.operation?.toUpperCase?.() ?? 'UNKNOWN';
    const collection = event.commit?.collection ?? 'unknown';
    const rkey = event.commit?.rkey ?? 'unknown';

    if (operation === 'DELETE') {
      return `[${time}] ${operation} ${collection} from ${didShort} rkey=${rkey}`;
    }

    const message = event.commit?.record?.message;
    if (typeof message === 'string') {
      return `[${time}] ${operation} ${collection} from ${didShort} rkey=${rkey} — "${message}"`;
    }

    return `[${time}] ${operation} ${collection} from ${didShort} rkey=${rkey}`;
  }

  if (event.kind === 'identity') {
    return `[${time}] IDENTITY ${didShort}`;
  }

  if (event.kind === 'account') {
    return `[${time}] ACCOUNT ${didShort} status=${event.account?.status}`;
  }

  return `[${time}] ${event.kind} from ${didShort}`;
}

function connect(opts, cursor) {
  const url = buildUrl(opts.collection, opts.did, cursor);
  let lastCursor = cursor;

  ws = new WebSocket(url);

  ws.onopen = () => {
    backoff = 1000;
    console.log(`Connected to ${url}`);
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      console.log('Warning: failed to parse message as JSON; skipping');
      return;
    }

    if (msg.time_us) {
      lastCursor = String(msg.time_us);
    }

    if (opts.verbose) {
      console.log(JSON.stringify(msg, null, 2));
      return;
    }

    console.log(formatEvent(msg));
  };

  ws.onclose = () => {
    if (shuttingDown) {
      return;
    }

    const delay = backoff;
    backoff = Math.min(backoff * 2, 30000);
    console.log(`Connection closed, reconnecting in ${delay}ms...`);
    setTimeout(() => connect(opts, lastCursor), delay);
  };

  ws.onerror = (err) => {
    const message = err?.message ?? 'unknown error';
    console.error(`WebSocket error: ${message}`);
  };
}

export default function register(program) {
  program
    .command('firehose')
    .description('Listen to Bluesky Jetstream firehose for custom record events')
    .option('-v, --verbose', 'Show full JSON for each event')
    .option('--did <did>', 'Filter by DID (reads BSKY_DID from .env if not provided)')
    .option('--collection <nsid>', 'Collection NSID to filter', DEFAULT_COLLECTION)
    .action(async (opts) => {
      try {
        if (!opts.did) {
          const env = loadEnv();
          if (env.BSKY_DID) {
            opts.did = env.BSKY_DID;
          }
        }

        for (const sig of ['SIGINT', 'SIGTERM']) {
          process.on(sig, () => {
            shuttingDown = true;
            console.log('\nShutting down...');
            if (ws) ws.close();
            process.exit(0);
          });
        }

        const url = buildUrl(opts.collection, opts.did, null);
        console.log('Jetstream Firehose Listener');
        console.log(`  Collection: ${opts.collection}`);
        if (opts.did) console.log(`  DID filter: ${opts.did}`);
        console.log(`  Endpoint:   ${url}`);
        console.log('  Ctrl+C to stop\n');

        connect(opts, null);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
