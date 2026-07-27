// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, expect, spyOn, test } from 'bun:test';
import { processCapEvent, processVouchEvent } from '../explore/src/jetstream.js';
import { createSqliteEnv } from './explore-d1-260727.js';

const PROJECT_A = 'vit:github.com/solpbc/thermals';
const PROJECT_A_ALIAS = 'https://github.com/solpbc/thermals';
const PROJECT_B = 'vit:tangled.org/solpbc.org/rookery';
const INVALID_BEACON = 'not a url';

function capCommit(operation, rkey, beacon, overrides = {}) {
  if (operation === 'delete') {
    return { operation, rkey };
  }

  return {
    operation,
    rkey,
    cid: overrides.cid ?? `cid-${rkey}`,
    record: {
      title: overrides.title ?? `Cap ${rkey}`,
      description: overrides.description ?? `Description ${rkey}`,
      ref: overrides.ref ?? `ref-${rkey}`,
      beacon,
      kind: overrides.kind ?? 'test',
      createdAt: overrides.createdAt ?? '2026-07-27T12:00:00.000Z',
    },
  };
}

function vouchCommit(operation, rkey, beacon, overrides = {}) {
  if (operation === 'delete') {
    return { operation, rkey };
  }

  return {
    operation,
    rkey,
    cid: overrides.cid ?? `cid-${rkey}`,
    record: {
      subject: {
        uri: overrides.capUri ?? 'at://did:plc:author/org.v-it.cap/source',
      },
      ref: overrides.ref ?? `ref-${rkey}`,
      beacon,
      kind: overrides.kind ?? 'endorse',
      createdAt: overrides.createdAt ?? '2026-07-27T12:00:01.000Z',
    },
  };
}

function aggregate(db, name) {
  return db
    .query('SELECT name, cap_count, vouch_count, last_activity FROM beacons WHERE name = ?')
    .get(name);
}

function expectConsistentAggregates(db) {
  const rows = db.query('SELECT name, cap_count, vouch_count FROM beacons ORDER BY name').all();
  for (const row of rows) {
    const counts = db.query(
      `SELECT
         (SELECT COUNT(*) FROM caps WHERE beacon = ?) AS cap_count,
         (SELECT COUNT(*) FROM vouches WHERE beacon = ?) AS vouch_count`,
    ).get(row.name, row.name);
    expect(row.cap_count).toBe(counts.cap_count);
    expect(row.vouch_count).toBe(counts.vouch_count);
    expect(row.cap_count).toBeGreaterThanOrEqual(0);
    expect(row.vouch_count).toBeGreaterThanOrEqual(0);
    expect(row.cap_count + row.vouch_count).toBeGreaterThan(0);
  }

  const missing = db.query(
    `SELECT beacon FROM (
       SELECT beacon FROM caps WHERE beacon IS NOT NULL
       UNION
       SELECT beacon FROM vouches WHERE beacon IS NOT NULL
     )
     WHERE beacon NOT IN (SELECT name FROM beacons)`,
  ).all();
  expect(missing).toEqual([]);
}

function expectIndexedBeacon(db, table, did, rkey, expected) {
  const row = db.query(`SELECT beacon FROM ${table} WHERE did = ? AND rkey = ?`).get(did, rkey);
  expect(row?.beacon ?? null).toBe(expected);
}

describe('Explore canonical beacon ingestion', () => {
  test('canonicalizes cap and vouch aliases into one aggregate row', async () => {
    const { db, env } = createSqliteEnv();
    try {
      const capDid = 'did:plc:caps';
      const vouchDid = 'did:plc:vouches';
      const aliasCap = capCommit('create', 'cap-alias', PROJECT_A_ALIAS);
      const canonicalCap = capCommit('create', 'cap-canonical', PROJECT_A);
      const vouch = vouchCommit('create', 'vouch-canonical', PROJECT_A);

      await processCapEvent(env, capDid, aliasCap);
      await processCapEvent(env, capDid, canonicalCap);
      await processVouchEvent(env, vouchDid, vouch);

      expect(db.query('SELECT id, rkey, beacon, record_json FROM caps ORDER BY id').all()).toEqual([
        {
          id: 1,
          rkey: 'cap-alias',
          beacon: PROJECT_A,
          record_json: JSON.stringify(aliasCap.record),
        },
        {
          id: 2,
          rkey: 'cap-canonical',
          beacon: PROJECT_A,
          record_json: JSON.stringify(canonicalCap.record),
        },
      ]);
      expect(db.query('SELECT id, rkey, beacon, record_json FROM vouches ORDER BY id').all()).toEqual([
        {
          id: 1,
          rkey: 'vouch-canonical',
          beacon: PROJECT_A,
          record_json: JSON.stringify(vouch.record),
        },
      ]);

      const rows = db.query(
        'SELECT name, cap_count, vouch_count, last_activity FROM beacons ORDER BY id',
      ).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        name: PROJECT_A,
        cap_count: 2,
        vouch_count: 1,
        last_activity: db.query("SELECT datetime('now') AS value").get().value,
      });
      expect(aggregate(db, PROJECT_A_ALIAS)).toBeNull();
      expectConsistentAggregates(db);
    } finally {
      db.close();
    }
  });

  test('keeps cap aggregates exact across moves, malformed updates, retries, and deletes', async () => {
    const { db, env } = createSqliteEnv();
    const did = 'did:plc:cap-transitions';
    const rkey = 'cap-transition';
    try {
      await processCapEvent(env, did, capCommit('create', rkey, PROJECT_A_ALIAS));
      expectIndexedBeacon(db, 'caps', did, rkey, PROJECT_A);
      expectConsistentAggregates(db);

      await processCapEvent(env, did, capCommit('update', rkey, PROJECT_B));
      expectIndexedBeacon(db, 'caps', did, rkey, PROJECT_B);
      expect(aggregate(db, PROJECT_A)).toBeNull();
      expectConsistentAggregates(db);

      await processCapEvent(env, did, capCommit('update', rkey, INVALID_BEACON));
      expectIndexedBeacon(db, 'caps', did, rkey, null);
      expect(aggregate(db, PROJECT_B)).toBeNull();
      expectConsistentAggregates(db);

      const validAgain = capCommit('update', rkey, PROJECT_A);
      await processCapEvent(env, did, validAgain);
      expectIndexedBeacon(db, 'caps', did, rkey, PROJECT_A);
      expectConsistentAggregates(db);

      await processCapEvent(env, did, validAgain);
      expect(aggregate(db, PROJECT_A)).toMatchObject({ cap_count: 1, vouch_count: 0 });
      expectConsistentAggregates(db);

      await processCapEvent(env, did, capCommit('delete', rkey));
      expectIndexedBeacon(db, 'caps', did, rkey, null);
      expect(aggregate(db, PROJECT_A)).toBeNull();
      expectConsistentAggregates(db);

      await processCapEvent(env, did, capCommit('delete', rkey));
      expect(aggregate(db, PROJECT_A)).toBeNull();
      expectConsistentAggregates(db);
    } finally {
      db.close();
    }
  });

  test('keeps vouch aggregates exact across moves, malformed updates, retries, and deletes', async () => {
    const { db, env } = createSqliteEnv();
    const did = 'did:plc:vouch-transitions';
    const rkey = 'vouch-transition';
    try {
      await processVouchEvent(env, did, vouchCommit('create', rkey, PROJECT_A_ALIAS));
      expectIndexedBeacon(db, 'vouches', did, rkey, PROJECT_A);
      expectConsistentAggregates(db);

      await processVouchEvent(env, did, vouchCommit('update', rkey, PROJECT_B));
      expectIndexedBeacon(db, 'vouches', did, rkey, PROJECT_B);
      expect(aggregate(db, PROJECT_A)).toBeNull();
      expectConsistentAggregates(db);

      await processVouchEvent(env, did, vouchCommit('update', rkey, INVALID_BEACON));
      expectIndexedBeacon(db, 'vouches', did, rkey, null);
      expect(aggregate(db, PROJECT_B)).toBeNull();
      expectConsistentAggregates(db);

      const validAgain = vouchCommit('update', rkey, PROJECT_A);
      await processVouchEvent(env, did, validAgain);
      expectIndexedBeacon(db, 'vouches', did, rkey, PROJECT_A);
      expectConsistentAggregates(db);

      await processVouchEvent(env, did, validAgain);
      expect(aggregate(db, PROJECT_A)).toMatchObject({ cap_count: 0, vouch_count: 1 });
      expectConsistentAggregates(db);

      await processVouchEvent(env, did, vouchCommit('delete', rkey));
      expectIndexedBeacon(db, 'vouches', did, rkey, null);
      expect(aggregate(db, PROJECT_A)).toBeNull();
      expectConsistentAggregates(db);

      await processVouchEvent(env, did, vouchCommit('delete', rkey));
      expect(aggregate(db, PROJECT_A)).toBeNull();
      expectConsistentAggregates(db);
    } finally {
      db.close();
    }
  });

  test('removes an aggregate only after both independent counts reach zero', async () => {
    const { db, env } = createSqliteEnv();
    try {
      await processCapEvent(env, 'did:plc:cap-a', capCommit('create', 'cap-a', PROJECT_A));
      await processVouchEvent(env, 'did:plc:vouch-a', vouchCommit('create', 'vouch-a', PROJECT_A));
      await processCapEvent(env, 'did:plc:cap-a', capCommit('delete', 'cap-a'));
      expect(aggregate(db, PROJECT_A)).toMatchObject({ cap_count: 0, vouch_count: 1 });
      await processVouchEvent(env, 'did:plc:vouch-a', vouchCommit('delete', 'vouch-a'));
      expect(aggregate(db, PROJECT_A)).toBeNull();

      await processCapEvent(env, 'did:plc:cap-b', capCommit('create', 'cap-b', PROJECT_B));
      await processVouchEvent(env, 'did:plc:vouch-b', vouchCommit('create', 'vouch-b', PROJECT_B));
      await processVouchEvent(env, 'did:plc:vouch-b', vouchCommit('delete', 'vouch-b'));
      expect(aggregate(db, PROJECT_B)).toMatchObject({ cap_count: 1, vouch_count: 0 });
      await processCapEvent(env, 'did:plc:cap-b', capCommit('delete', 'cap-b'));
      expect(aggregate(db, PROJECT_B)).toBeNull();
      expectConsistentAggregates(db);
    } finally {
      db.close();
    }
  });

  test('stores hostile beacon fields only in record_json and emits one bounded warning', async () => {
    const invalidCases = [
      { label: 'object', value: { hostile: 'object-beacon-secret' } },
      { label: 'array', value: ['array-beacon-secret'] },
      { label: 'whitespace', value: '   ' },
      { label: 'oversized', value: 'oversized-beacon-secret-'.repeat(600) },
    ];

    for (const [caseIndex, invalidCase] of invalidCases.entries()) {
      for (const kind of ['cap', 'vouch']) {
        const { db, env } = createSqliteEnv();
        const did = `did:plc:${kind}-${invalidCase.label}`;
        const rkey = invalidCase.label === 'oversized' ? `record-${'r'.repeat(900)}` : `record-${caseIndex}`;
        const commit = kind === 'cap'
          ? capCommit('create', rkey, invalidCase.value)
          : vouchCommit('create', rkey, invalidCase.value);
        const warn = spyOn(console, 'warn').mockImplementation(() => {});

        try {
          if (kind === 'cap') {
            await processCapEvent(env, did, commit);
          } else {
            await processVouchEvent(env, did, commit);
          }

          const table = kind === 'cap' ? 'caps' : 'vouches';
          const row = db
            .query(`SELECT beacon, record_json FROM ${table} WHERE did = ? AND rkey = ?`)
            .get(did, rkey);
          expect(row).toEqual({
            beacon: null,
            record_json: JSON.stringify(commit.record),
          });
          expect(db.query('SELECT * FROM beacons').all()).toEqual([]);
          expect(warn).toHaveBeenCalledTimes(1);

          const message = warn.mock.calls[0][0];
          expect(message).toStartWith(
            'explore: beacon normalization failed class=invalid-beacon record=at://',
          );
          expect(new TextEncoder().encode(message).byteLength).toBeLessThanOrEqual(512);
          expect(message).not.toContain(JSON.stringify(invalidCase.value));
          if (typeof invalidCase.value === 'string' && invalidCase.value.trim()) {
            expect(message).not.toContain(invalidCase.value.slice(0, 32));
          }
          expectConsistentAggregates(db);
        } finally {
          warn.mockRestore();
          db.close();
        }
      }
    }
  });

  test('malformed updates preserve source records while clearing indexed beacons', async () => {
    for (const kind of ['cap', 'vouch']) {
      const { db, env } = createSqliteEnv();
      const did = `did:plc:${kind}-malformed-update`;
      const rkey = `${kind}-malformed-update`;
      const valid = kind === 'cap'
        ? capCommit('create', rkey, PROJECT_A)
        : vouchCommit('create', rkey, PROJECT_A);
      const malformed = kind === 'cap'
        ? capCommit('update', rkey, INVALID_BEACON)
        : vouchCommit('update', rkey, INVALID_BEACON);
      const handler = kind === 'cap' ? processCapEvent : processVouchEvent;
      const warn = spyOn(console, 'warn').mockImplementation(() => {});

      try {
        await handler(env, did, valid);
        warn.mockClear();
        await handler(env, did, malformed);

        const table = kind === 'cap' ? 'caps' : 'vouches';
        expect(db.query(`SELECT beacon, record_json FROM ${table}`).get()).toEqual({
          beacon: null,
          record_json: JSON.stringify(malformed.record),
        });
        expect(db.query('SELECT * FROM beacons').all()).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);
        const message = warn.mock.calls[0][0];
        expect(message).not.toContain(INVALID_BEACON);
        expect(new TextEncoder().encode(message).byteLength).toBeLessThanOrEqual(512);
        expectConsistentAggregates(db);
      } finally {
        warn.mockRestore();
        db.close();
      }
    }
  });
});
