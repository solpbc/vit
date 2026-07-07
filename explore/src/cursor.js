// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

export const CURSOR_NAME = 'jetstream';
const CURSOR_URL = 'https://cursor.internal/';

function cursorStub(env) {
  const id = env.CURSOR_STORE.idFromName(CURSOR_NAME);
  return env.CURSOR_STORE.get(id);
}

export async function readCursor(env) {
  const res = await cursorStub(env).fetch(CURSOR_URL, { method: 'GET' });
  if (!res.ok) {
    throw new Error('cursor read failed: ' + res.status);
  }
  return await res.text();
}

export async function writeCursor(env, value) {
  const res = await cursorStub(env).fetch(CURSOR_URL, { method: 'PUT', body: String(value) });
  if (!res.ok) {
    throw new Error('cursor write failed: ' + res.status);
  }
}

export class CursorStore {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method === 'GET') {
      return new Response((await this.state.storage.get('cursor')) || '');
    }

    if (request.method === 'PUT') {
      const text = await request.text();
      await this.state.storage.put('cursor', text);
      return new Response('ok');
    }

    return new Response('method not allowed', { status: 405 });
  }
}
