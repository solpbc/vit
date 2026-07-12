// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { handleRequest } from './api.js';
import { readCursor, writeCursor } from './cursor.js';
import { streamEvents } from './jetstream.js';

export { CursorStore } from './cursor.js';

// 45 minutes in microseconds.
const STARTUP_REPLAY_US = 2_700_000_000;

// Jetstream retains only a bounded backfill window (~72h). A resume cursor older
// than this edge cannot be fully replayed: the events between the cursor and the
// edge have already aged out, so subscribing with that cursor silently starts
// playback at Jetstream's oldest retained event — a gap that otherwise looks
// like a clean replay. Bound the replay to this edge and log when we hit it.
const JETSTREAM_RETENTION_US = 72 * 60 * 60 * 1_000_000;

function validCursor(value) {
  const parsed = Number(value);
  return /^\d+$/.test(value) && parsed > 0 && Number.isSafeInteger(parsed);
}

export async function runScheduled(env, { streamReader = streamEvents, now = Date.now } = {}) {
  const windowOpen = now() * 1000;
  const stored = await readCursor(env);

  let startCursor;
  if (stored === '') {
    startCursor = windowOpen - STARTUP_REPLAY_US;
  } else if (validCursor(stored)) {
    startCursor = Number(stored);
  } else {
    throw new Error('malformed cursor: ' + JSON.stringify(stored));
  }

  // Bound the replay window: never ask Jetstream to replay past its retention
  // edge. If the resume cursor predates the edge (long outage, instance flip
  // onto a lagging node), the gap before the edge is unrecoverable — surface it
  // explicitly instead of masquerading as a complete replay, then resume from
  // the edge so we still recover everything Jetstream still retains.
  const retentionEdge = windowOpen - JETSTREAM_RETENTION_US;
  if (startCursor < retentionEdge) {
    console.warn(
      `explore: resume cursor ${startCursor} is older than the Jetstream ` +
        `retention edge ${retentionEdge} (~72h); events before the edge are ` +
        `unrecoverable — clamping replay to the retention edge`,
    );
    startCursor = retentionEdge;
  }

  const { observedCursor } = await streamReader(env, startCursor);
  const sawNewer = observedCursor != null && Number(observedCursor) > startCursor;
  const nextCursor = sawNewer ? String(observedCursor) : String(windowOpen);
  await writeCursor(env, nextCursor);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleRequest(request, env);
    }

    return new Response('not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    await runScheduled(env);
  },
};
