// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runScheduled } from '../explore/src/index.js';
import { streamEvents } from '../explore/src/jetstream.js';

const BEACON = 'vit:github.com/solpbc/vit';

let originalWebSocket;
let originalFetch;
// Populated per test: the URL every FakeWebSocket was constructed with, and the
// messages the next-opened socket should replay before closing.
let socketUrls;
let nextMessages;

beforeEach(() => {
  originalWebSocket = globalThis.WebSocket;
  originalFetch = globalThis.fetch;
  // Handle resolution is best-effort; keep it a no-op so it never affects the window.
  globalThis.fetch = async () => ({ ok: false });
  socketUrls = [];
  nextMessages = [];

  globalThis.WebSocket = class FakeWebSocket {
    constructor(url) {
      socketUrls.push(String(url));
      this.listeners = {};
      const messages = nextMessages;
      setTimeout(() => {
        for (const message of messages) {
          this.listeners.message?.({ data: JSON.stringify(message) });
        }
        setTimeout(() => this.listeners.close?.({}), 0);
      }, 0);
    }

    addEventListener(type, callback) {
      this.listeners[type] = callback;
    }

    close() {
      this.listeners.close?.({});
    }
  };
});

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
  globalThis.fetch = originalFetch;
});

class FakeStatement {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql.replace(/\s+/g, ' ').trim();
    this.args = args;
  }

  bind(...args) {
    return new FakeStatement(this.db, this.sql, args);
  }

  async first() {
    if (this.sql.startsWith('SELECT beacon FROM caps')) {
      const [did, rkey] = this.args;
      return this.db.caps.get(`${did}/${rkey}`) ?? null;
    }
    if (this.sql.startsWith('SELECT handle, fetched_at FROM handles')) {
      return null;
    }
    throw new Error(`unsupported first: ${this.sql}`);
  }

  async run() {
    if (this.sql.startsWith('INSERT INTO caps')) {
      const [did, rkey, uri, cid, title, description, ref, beacon, kind, recordJson, createdAt] = this.args;
      this.db.caps.set(`${did}/${rkey}`, {
        did, rkey, uri, cid, title, description, ref, beacon, kind,
        record_json: recordJson,
        created_at: createdAt,
      });
      return { success: true };
    }
    if (this.sql.startsWith('INSERT INTO beacons') && this.sql.includes('cap_count')) {
      const [beacon] = this.args;
      const row = this.db.beacons.get(beacon) ?? { name: beacon, cap_count: 0, vouch_count: 0 };
      row.cap_count += 1;
      this.db.beacons.set(beacon, row);
      return { success: true };
    }
    throw new Error(`unsupported run: ${this.sql}`);
  }
}

class FakeD1 {
  constructor() {
    this.caps = new Map();
    this.beacons = new Map();
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    for (const statement of statements) {
      await statement.run();
    }
    return statements.map(() => ({ success: true }));
  }
}

// A stateful stand-in for the bound CursorStore durable object: a PUT is
// readable by the next GET, exactly as the real DO persists across cron windows
// and instance restarts. This is what makes "resume across a disconnect" real.
function statefulCursorStore(initial = '') {
  let value = initial;
  return {
    idFromName() {
      return { name: 'jetstream' };
    },
    get() {
      return {
        fetch: async (_url, { method, body } = {}) => {
          if (method === 'GET') {
            return new Response(value, { status: 200 });
          }
          if (method === 'PUT') {
            value = String(body);
            return new Response('ok', { status: 200 });
          }
          return new Response('method not allowed', { status: 405 });
        },
      };
    },
    current() {
      return value;
    },
  };
}

function capMessage(timeUs, rkey) {
  return {
    kind: 'commit',
    did: 'did:plc:resume',
    time_us: timeUs,
    commit: {
      operation: 'create',
      collection: 'org.v-it.cap',
      rkey,
      cid: `cid-${rkey}`,
      record: {
        title: `Cap ${rkey}`,
        description: '',
        ref: `ref-${rkey}`,
        beacon: BEACON,
        createdAt: '2026-07-07T00:00:00.000Z',
      },
    },
  };
}

describe('explore cursor durability across reconnects', () => {
  test('resumes from the persisted cursor without loss across a simulated disconnect', async () => {
    const store = statefulCursorStore('');
    const db = new FakeD1();
    const env = { CURSOR_STORE: store, DB: db };

    // Microsecond timeline (real Jetstream time_us values, safely < 2^53).
    const W1_US = 1_760_000_000_000_000; // window-1 open
    const NOW1_MS = W1_US / 1000;
    // The DO already holds a recent cursor from a prior window (well within the
    // ~72h retention edge, so it resumes verbatim — no clamp). Seed it as if a
    // prior window had persisted it.
    const C0 = W1_US - 30_000_000;
    await env.CURSOR_STORE.get().fetch('https://cursor/', { method: 'PUT', body: String(C0) });

    // --- Window 1 (pre-disconnect): resume from C0, ingest two caps. ---
    nextMessages = [
      capMessage(W1_US - 20_000_000, 'cap-a'),
      capMessage(W1_US - 10_000_000, 'cap-b'),
    ];
    await runScheduled(env, { now: () => NOW1_MS });

    // Subscribed FROM the persisted cursor, and advanced to the newest event seen.
    expect(new URL(socketUrls[0]).searchParams.get('cursor')).toBe(String(C0));
    expect(db.caps.has('did:plc:resume/cap-a')).toBe(true);
    expect(db.caps.has('did:plc:resume/cap-b')).toBe(true);
    expect(store.current()).toBe(String(W1_US - 10_000_000));

    // --- Simulated disconnect / instance flip: the worker tears down; the DO
    //     keeps the cursor. A cap lands in the gap while nothing is connected. ---
    socketUrls.length = 0;
    const NOW2_MS = NOW1_MS + 60_000; // next cron window, ~60s later
    const gapEvent = W1_US - 5_000_000; // newer than the persisted tip
    nextMessages = [capMessage(gapEvent, 'cap-gap')];
    await runScheduled(env, { now: () => NOW2_MS });

    // Window 2 reconnects FROM exactly where window 1 stopped — the cursor is a
    // wall-clock timestamp, so it is portable across a jetstream1/2 instance flip.
    expect(new URL(socketUrls[0]).searchParams.get('cursor')).toBe(String(W1_US - 10_000_000));
    // The event that arrived during the disconnect is recovered on reconnect — no loss.
    expect(db.caps.has('did:plc:resume/cap-gap')).toBe(true);
    expect(store.current()).toBe(String(gapEvent));
  });

  test('tracks the newest cursor monotonically regardless of event arrival order', async () => {
    const env = { DB: new FakeD1() };
    // Events arrive out of order (newer, then older). The persisted cursor must
    // be the max time_us seen, never the last one — otherwise a reconnect would
    // rewind and re-risk the events between them.
    nextMessages = [
      capMessage(3_000_000, 'newer'),
      capMessage(1_000_000, 'older'),
    ];

    const { observedCursor } = await streamEvents(env, String(500_000));

    expect(observedCursor).toBe('3000000');
    // It also subscribes from the supplied resume cursor.
    expect(new URL(socketUrls[0]).searchParams.get('cursor')).toBe('500000');
  });
});
