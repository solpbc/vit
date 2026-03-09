// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { handleRequest } from './api.js';
import { streamEvents } from './jetstream.js';

export { CursorStore } from './cursor.js';

async function getCursor(env) {
  const id = env.CURSOR_STORE.idFromName('cursor');
  const stub = env.CURSOR_STORE.get(id);
  const res = await stub.fetch('http://cursor/');
  return (await res.text()) || null;
}

async function saveCursor(env, cursor) {
  const id = env.CURSOR_STORE.idFromName('cursor');
  const stub = env.CURSOR_STORE.get(id);
  await stub.fetch('http://cursor/', { method: 'PUT', body: cursor });
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
    const cursor = await getCursor(env);
    const result = await streamEvents(env, cursor);
    if (result.latestCursor) {
      await saveCursor(env, result.latestCursor);
    }
  },
};
