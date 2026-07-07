// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { streamEvents } from '../explore/src/jetstream.js';

const BEACON = 'vit:github.com/solpbc/vit';

let originalWebSocket;
let originalFetch;

beforeEach(() => {
  originalWebSocket = globalThis.WebSocket;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false });
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
      const row = this.db.caps.get(`${did}/${rkey}`) ?? null;
      await new Promise(resolve => setTimeout(resolve, 0));
      return row;
    }

    if (this.sql.startsWith('SELECT beacon FROM vouches')) {
      const [did, rkey] = this.args;
      const row = this.db.vouches.get(`${did}/${rkey}`) ?? null;
      await new Promise(resolve => setTimeout(resolve, 0));
      return row;
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
        did,
        rkey,
        uri,
        cid,
        title,
        description,
        ref,
        beacon,
        kind,
        record_json: recordJson,
        created_at: createdAt,
      });
      return { success: true };
    }

    if (this.sql.startsWith('INSERT INTO vouches')) {
      const [did, rkey, uri, cid, capUri, ref, beacon, kind, recordJson, createdAt] = this.args;
      this.db.vouches.set(`${did}/${rkey}`, {
        did,
        rkey,
        uri,
        cid,
        cap_uri: capUri,
        ref,
        beacon,
        kind,
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

    if (this.sql.startsWith('INSERT INTO beacons') && this.sql.includes('vouch_count')) {
      const [beacon] = this.args;
      const row = this.db.beacons.get(beacon) ?? { name: beacon, cap_count: 0, vouch_count: 0 };
      row.vouch_count += 1;
      this.db.beacons.set(beacon, row);
      return { success: true };
    }

    throw new Error(`unsupported run: ${this.sql}`);
  }
}

class FakeD1 {
  constructor() {
    this.caps = new Map();
    this.vouches = new Map();
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

function installWebSocketReplay(messages) {
  globalThis.WebSocket = class FakeWebSocket {
    constructor() {
      this.listeners = {};
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
}

function capMessage() {
  return {
    kind: 'commit',
    did: 'did:plc:race',
    time_us: 1,
    commit: {
      operation: 'create',
      collection: 'org.v-it.cap',
      rkey: 'same-rkey',
      cid: 'cap-cid',
      record: {
        title: 'Race cap',
        description: 'Duplicate create event',
        ref: 'race-count-test',
        beacon: BEACON,
        createdAt: '2026-07-07T00:00:00.000Z',
      },
    },
  };
}

function vouchMessage() {
  return {
    kind: 'commit',
    did: 'did:plc:race',
    time_us: 1,
    commit: {
      operation: 'create',
      collection: 'org.v-it.vouch',
      rkey: 'same-rkey',
      cid: 'vouch-cid',
      record: {
        subject: { uri: 'at://did:plc:race/org.v-it.cap/source' },
        ref: 'race-count-test',
        beacon: BEACON,
        createdAt: '2026-07-07T00:00:00.000Z',
      },
    },
  };
}

describe('explore jetstream ingest', () => {
  test('serializes duplicate cap events for one record before updating beacon counts', async () => {
    const env = { DB: new FakeD1() };
    installWebSocketReplay([capMessage(), capMessage()]);

    await streamEvents(env, null);

    expect(env.DB.caps.size).toBe(1);
    expect(env.DB.beacons.get(BEACON)).toMatchObject({ cap_count: 1, vouch_count: 0 });
  });

  test('serializes duplicate vouch events for one record before updating beacon counts', async () => {
    const env = { DB: new FakeD1() };
    installWebSocketReplay([vouchMessage(), vouchMessage()]);

    await streamEvents(env, null);

    expect(env.DB.vouches.size).toBe(1);
    expect(env.DB.beacons.get(BEACON)).toMatchObject({ cap_count: 0, vouch_count: 1 });
  });
});
