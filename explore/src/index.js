// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { handleRequest } from './api.js';
import { streamEvents } from './jetstream.js';

export { CursorStore } from './cursor.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleRequest(request, env);
    }

    return new Response('not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    // Always live-tail (no cursor) — Jetstream doesn't replay custom lexicon
    // commits via cursor. D1 UNIQUE constraints handle deduplication.
    const result = await streamEvents(env, null);
  },
};
