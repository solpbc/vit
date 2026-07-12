// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { runScheduled } from '../explore/src/index.js';
import { processCapEvent, processSkillEvent, processVouchEvent } from '../explore/src/jetstream.js';

function createCursorEnv({
  stored = '',
  getStatus = 200,
  putStatus = 200,
  getThrows = null,
  putThrows = null,
} = {}) {
  const store = {
    idNames: [],
    ids: [],
    gets: 0,
    puts: 0,
    putBodies: [],
    idFromName(name) {
      this.idNames.push(name);
      return { name };
    },
    get(id) {
      this.ids.push(id);
      return {
        fetch: async (url, { method, body } = {}) => {
          if (method === 'GET') {
            store.gets++;
            if (getThrows) {
              throw getThrows;
            }
            return new Response(stored, { status: getStatus });
          }

          if (method === 'PUT') {
            store.puts++;
            store.putBodies.push(String(body));
            if (putThrows) {
              throw putThrows;
            }
            return new Response('ok', { status: putStatus });
          }

          return new Response('method not allowed', { status: 405 });
        },
      };
    },
  };

  return { env: { CURSOR_STORE: store }, store };
}

function createStreamReader({ result = { observedCursor: null }, error = null } = {}) {
  const calls = [];
  const streamReader = async (env, startCursor) => {
    calls.push({ env, startCursor });
    if (error) {
      throw error;
    }
    return result;
  };
  streamReader.calls = calls;
  return streamReader;
}

function d1Statement(db, sql, args = []) {
  return {
    sql,
    args,
    bind(...nextArgs) {
      return d1Statement(db, sql, nextArgs);
    },
    first() {
      return db.query(sql).get(...args) ?? null;
    },
    run() {
      return db.query(sql).run(...args);
    },
    all() {
      return { results: db.query(sql).all(...args) };
    },
  };
}

function createD1(db) {
  const executeBatch = db.transaction((statements) => statements.map((stmt) => {
    if (/^\s*select\b/i.test(stmt.sql)) {
      return stmt.all();
    }
    return stmt.run();
  }));

  return {
    prepare(sql) {
      return d1Statement(db, sql);
    },
    batch(statements) {
      return executeBatch(statements);
    },
  };
}

function createSqliteEnv() {
  const db = new Database(':memory:');
  const schemaPath = join(import.meta.dir, '..', 'explore', 'schema.sql');
  db.exec(readFileSync(schemaPath, 'utf8'));
  return { db, env: { DB: createD1(db) } };
}

describe('explore scheduled cursor', () => {
  test('passes stored valid cursor and writes newer observed cursor', async () => {
    const { env, store } = createCursorEnv({ stored: '12345' });
    const streamReader = createStreamReader({ result: { observedCursor: '12399' } });

    await runScheduled(env, { streamReader, now: () => 999 });

    expect(store.idNames).toEqual(['jetstream', 'jetstream']);
    expect(streamReader.calls.length).toBe(1);
    expect(streamReader.calls[0].env).toBe(env);
    expect(streamReader.calls[0].startCursor).toBe(12345);
    expect(store.putBodies).toEqual(['12399']);
  });

  test('uses startup replay window when no cursor is stored', async () => {
    const withEvent = createCursorEnv({ stored: '' });
    const eventReader = createStreamReader({ result: { observedCursor: '300000123' } });

    await runScheduled(withEvent.env, { streamReader: eventReader, now: () => 3_000_000 });

    expect(eventReader.calls[0].startCursor).toBe(300_000_000);
    expect(withEvent.store.putBodies).toEqual(['300000123']);

    const quiet = createCursorEnv({ stored: '' });
    const quietReader = createStreamReader({ result: { observedCursor: null } });

    await runScheduled(quiet.env, { streamReader: quietReader, now: () => 3_000_000 });

    expect(quietReader.calls[0].startCursor).toBe(300_000_000);
    expect(quiet.store.putBodies).toEqual(['3000000000']);
  });

  test('writes window-open cursor for a quiet run', async () => {
    const { env, store } = createCursorEnv({ stored: '1000' });
    const streamReader = createStreamReader({ result: { observedCursor: null } });

    await runScheduled(env, { streamReader, now: () => 2 });

    expect(streamReader.calls[0].startCursor).toBe(1000);
    expect(store.putBodies).toEqual(['2000']);
  });

  test('cursor write failure rejects for event and quiet-window cursors', async () => {
    const withEvent = createCursorEnv({ stored: '1000', putStatus: 500 });
    const eventReader = createStreamReader({ result: { observedCursor: '1500' } });

    await expect(runScheduled(withEvent.env, { streamReader: eventReader, now: () => 2 }))
      .rejects.toThrow('cursor write failed: 500');
    expect(withEvent.store.putBodies).toEqual(['1500']);

    const quiet = createCursorEnv({ stored: '1000', putStatus: 500 });
    const quietReader = createStreamReader({ result: { observedCursor: null } });

    await expect(runScheduled(quiet.env, { streamReader: quietReader, now: () => 2 }))
      .rejects.toThrow('cursor write failed: 500');
    expect(quiet.store.putBodies).toEqual(['2000']);
  });

  test('cursor read failure rejects before streaming', async () => {
    const cases = [
      { fake: createCursorEnv({ stored: '1000', getStatus: 500 }), message: 'cursor read failed: 500' },
      { fake: createCursorEnv({ stored: '1000', getThrows: new Error('read exploded') }), message: 'read exploded' },
    ];

    for (const { fake, message } of cases) {
      const streamReader = createStreamReader();

      await expect(runScheduled(fake.env, { streamReader, now: () => 2 }))
        .rejects.toThrow(message);
      expect(streamReader.calls.length).toBe(0);
      expect(fake.store.putBodies).toEqual([]);
    }
  });

  test('malformed stored cursors reject before streaming', async () => {
    for (const stored of ['abc', '-5', '0', '1.5', '  ']) {
      const { env, store } = createCursorEnv({ stored });
      const streamReader = createStreamReader();

      await expect(runScheduled(env, { streamReader, now: () => 2 }))
        .rejects.toThrow('malformed cursor: ' + JSON.stringify(stored));
      expect(streamReader.calls.length).toBe(0);
      expect(store.putBodies).toEqual([]);
    }
  });

  test('stream reader rejection propagates without writing cursor', async () => {
    const { env, store } = createCursorEnv({ stored: '1000' });
    const streamReader = createStreamReader({ error: new Error('stream failed') });

    await expect(runScheduled(env, { streamReader, now: () => 2 }))
      .rejects.toThrow('stream failed');
    expect(streamReader.calls.length).toBe(1);
    expect(store.putBodies).toEqual([]);
  });

  test('clamps replay to the retention edge and logs a gap when the stored cursor predates retention', async () => {
    // now (ms) large enough that the retention edge is a positive cursor the
    // stale stored value falls behind: windowOpen = 400_000_000 * 1000 =
    // 400_000_000_000 us; edge = windowOpen - 72h (259_200_000_000 us) =
    // 140_800_000_000. A stored cursor of 1000 is far older than the edge.
    const { env, store } = createCursorEnv({ stored: '1000' });
    const streamReader = createStreamReader({ result: { observedCursor: null } });

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      await runScheduled(env, { streamReader, now: () => 400_000_000 });
    } finally {
      console.warn = originalWarn;
    }

    // Replay is bounded forward to the retention edge, not the stale cursor.
    expect(streamReader.calls[0].startCursor).toBe(140_800_000_000);
    // The gap is surfaced explicitly rather than silently swallowed.
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('older than the Jetstream retention edge');
    // A quiet clamped window still advances the cursor to the window-open time.
    expect(store.putBodies).toEqual(['400000000000']);
  });

  test('resumes from a within-retention cursor without clamping or logging a gap', async () => {
    // Stored cursor sits ~30s behind window open — comfortably inside the ~72h
    // retention window, so it is used verbatim and no gap is logged.
    const windowOpenUs = 400_000_000_000;
    const recentCursor = windowOpenUs - 30_000_000; // 30s of microseconds
    const { env, store } = createCursorEnv({ stored: String(recentCursor) });
    const streamReader = createStreamReader({ result: { observedCursor: String(windowOpenUs - 1_000_000) } });

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      await runScheduled(env, { streamReader, now: () => 400_000_000 });
    } finally {
      console.warn = originalWarn;
    }

    expect(streamReader.calls[0].startCursor).toBe(recentCursor);
    expect(warnings.length).toBe(0);
    expect(store.putBodies).toEqual([String(windowOpenUs - 1_000_000)]);
  });
});

describe('explore event idempotency', () => {
  test('processes duplicate cap, vouch, and skill creates idempotently', async () => {
    const { db, env } = createSqliteEnv();

    const capDid = 'did:plc:capauthor';
    const capCommit = {
      operation: 'create',
      rkey: '3lcap',
      cid: 'bafycap',
      record: {
        title: 'Idempotent Cap',
        description: 'A cap inserted twice for testing.',
        ref: 'idempotent-cap-test',
        beacon: 'vit:example/repo',
        kind: 'test',
        createdAt: '2026-07-07T00:00:00.000Z',
      },
    };

    await processCapEvent(env, capDid, capCommit);
    const capAfterOne = db
      .query("SELECT (SELECT COUNT(*) FROM caps) AS rows, (SELECT cap_count FROM beacons WHERE name = ?) AS count")
      .get('vit:example/repo');
    await processCapEvent(env, capDid, capCommit);
    const capAfterTwo = db
      .query("SELECT (SELECT COUNT(*) FROM caps) AS rows, (SELECT cap_count FROM beacons WHERE name = ?) AS count")
      .get('vit:example/repo');

    expect(capAfterOne).toEqual({ rows: 1, count: 1 });
    expect(capAfterTwo).toEqual(capAfterOne);

    const vouchDid = 'did:plc:vouchauthor';
    const vouchCommit = {
      operation: 'create',
      rkey: '3lvouch',
      cid: 'bafyvouch',
      record: {
        subject: { uri: 'at://did:plc:capauthor/org.v-it.cap/3lcap' },
        ref: 'idempotent-cap-test',
        beacon: 'vit:example/repo',
        kind: 'want',
        createdAt: '2026-07-07T00:00:01.000Z',
      },
    };

    await processVouchEvent(env, vouchDid, vouchCommit);
    const vouchAfterOne = db
      .query("SELECT (SELECT COUNT(*) FROM vouches) AS rows, (SELECT vouch_count FROM beacons WHERE name = ?) AS count")
      .get('vit:example/repo');
    await processVouchEvent(env, vouchDid, vouchCommit);
    const vouchAfterTwo = db
      .query("SELECT (SELECT COUNT(*) FROM vouches) AS rows, (SELECT vouch_count FROM beacons WHERE name = ?) AS count")
      .get('vit:example/repo');

    expect(vouchAfterOne).toEqual({ rows: 1, count: 1 });
    expect(vouchAfterTwo).toEqual(vouchAfterOne);

    const skillDid = 'did:plc:skillauthor';
    const skillCommit = {
      operation: 'create',
      rkey: '3lskill',
      cid: 'bafyskill',
      record: {
        name: 'idempotent-skill',
        description: 'A skill inserted twice for testing.',
        version: '1.0.0',
        tags: ['test'],
        createdAt: '2026-07-07T00:00:02.000Z',
      },
    };

    await processSkillEvent(env, skillDid, skillCommit);
    const skillAfterOne = db.query('SELECT COUNT(*) AS rows FROM skills').get();
    await processSkillEvent(env, skillDid, skillCommit);
    const skillAfterTwo = db.query('SELECT COUNT(*) AS rows FROM skills').get();

    expect(skillAfterOne).toEqual({ rows: 1 });
    expect(skillAfterTwo).toEqual(skillAfterOne);

    db.close();
  });
});
