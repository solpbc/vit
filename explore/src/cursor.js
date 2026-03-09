// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

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
