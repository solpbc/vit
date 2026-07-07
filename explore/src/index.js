// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { handleRequest } from './api.js';
import { readCursor, writeCursor } from './cursor.js';
import { streamEvents } from './jetstream.js';

export { CursorStore } from './cursor.js';

// 45 minutes in microseconds.
const STARTUP_REPLAY_US = 2_700_000_000;

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
