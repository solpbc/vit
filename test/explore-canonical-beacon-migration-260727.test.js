// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSqliteEnv, splitSqlStatements } from './explore-d1-260727.js';

const MIGRATION_PATH = join(
  import.meta.dir,
  '..',
  'explore',
  'migrate-260727-canonical-beacons.sql',
);
const MIGRATION_SQL = readFileSync(MIGRATION_PATH, 'utf8');

const PROJECTS = {
  rookery: {
    alias: 'https://tangled.org/solpbc.org/rookery',
    canonical: 'vit:tangled.org/solpbc.org/rookery',
    aliasAggregate: [0, 0, '2026-07-26 06:44:23'],
    canonicalAggregate: [6, 1, '2026-07-26 06:44:23'],
  },
  thermals: {
    alias: 'https://github.com/solpbc/thermals',
    canonical: 'vit:github.com/solpbc/thermals',
    aliasAggregate: [2, 0, '2026-07-22 23:38:55'],
    canonicalAggregate: [2, 0, '2026-07-23 16:37:48'],
  },
  vmlx: {
    alias: 'https://github.com/osaurus-ai/vmlx-swift',
    canonical: 'vit:github.com/osaurus-ai/vmlx-swift',
    aliasAggregate: [1, 0, '2026-07-08 22:08:52'],
    canonicalAggregate: [1, 1, '2026-07-25 09:39:21'],
  },
};

function insertBeacon(db, name, capCount, vouchCount, lastActivity) {
  db.query(
    `INSERT INTO beacons (name, cap_count, vouch_count, last_activity)
     VALUES (?, ?, ?, ?)`,
  ).run(name, capCount, vouchCount, lastActivity);
}

function insertCap(db, sequence, beacon) {
  const recordJson = JSON.stringify({
    $type: 'org.v-it.cap',
    sequence,
    beacon,
    untouched: `cap-record-${sequence}`,
  });
  db.query(
    `INSERT INTO caps (
       did, rkey, uri, cid, title, description, ref, beacon, kind, record_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `did:plc:migration-cap-${sequence}`,
    `cap-${sequence}`,
    `at://did:plc:migration-cap-${sequence}/org.v-it.cap/cap-${sequence}`,
    `cid-cap-${sequence}`,
    `Migration cap ${sequence}`,
    `Migration description ${sequence}`,
    `migration-cap-${sequence}`,
    beacon,
    'test',
    recordJson,
    `2026-07-${String((sequence % 27) + 1).padStart(2, '0')}T00:00:00.000Z`,
  );
}

function insertVouch(db, sequence, beacon) {
  const recordJson = JSON.stringify({
    $type: 'org.v-it.vouch',
    sequence,
    beacon,
    untouched: `vouch-record-${sequence}`,
  });
  db.query(
    `INSERT INTO vouches (
       did, rkey, uri, cid, cap_uri, ref, beacon, kind, record_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `did:plc:migration-vouch-${sequence}`,
    `vouch-${sequence}`,
    `at://did:plc:migration-vouch-${sequence}/org.v-it.vouch/vouch-${sequence}`,
    `cid-vouch-${sequence}`,
    'at://did:plc:migration-cap-1/org.v-it.cap/cap-1',
    `migration-vouch-${sequence}`,
    beacon,
    'endorse',
    recordJson,
    `2026-07-${String(sequence + 1).padStart(2, '0')}T01:00:00.000Z`,
  );
}

function seedProductionShape(db) {
  const seed = db.transaction(() => {
    for (const project of Object.values(PROJECTS)) {
      insertBeacon(db, project.alias, ...project.aliasAggregate);
      insertBeacon(db, project.canonical, ...project.canonicalAggregate);
    }

    for (let index = 0; index < 16; index += 1) {
      insertBeacon(
        db,
        `vit:unrelated-${index}.example/owner/repo`,
        index === 0 ? 51 : 100 + index,
        200 + index,
        `2026-06-${String(index + 1).padStart(2, '0')} 00:00:00`,
      );
    }

    let sequence = 1;
    for (let index = 0; index < 6; index += 1) {
      insertCap(db, sequence++, PROJECTS.rookery.canonical);
    }
    for (let index = 0; index < 2; index += 1) {
      insertCap(db, sequence++, PROJECTS.thermals.alias);
    }
    for (let index = 0; index < 2; index += 1) {
      insertCap(db, sequence++, PROJECTS.thermals.canonical);
    }
    insertCap(db, sequence++, PROJECTS.vmlx.alias);
    insertCap(db, sequence++, PROJECTS.vmlx.canonical);
    while (sequence <= 63) {
      insertCap(db, sequence++, 'vit:unrelated-0.example/owner/repo');
    }

    insertVouch(db, 1, PROJECTS.rookery.canonical);
    insertVouch(db, 2, PROJECTS.vmlx.canonical);

    // Deliberate canonical aggregate drift proves the migration recounts facts.
    db.query(
      'UPDATE beacons SET cap_count = 777, vouch_count = 9 WHERE name = ?',
    ).run(PROJECTS.thermals.canonical);
  });
  seed();
}

function snapshot(db) {
  return {
    caps: db.query('SELECT * FROM caps ORDER BY id').all(),
    vouches: db.query('SELECT * FROM vouches ORDER BY id').all(),
    beacons: db.query('SELECT * FROM beacons ORDER BY id').all(),
  };
}

function migrationStatements(env) {
  return splitSqlStatements(MIGRATION_SQL).map((sql) => env.DB.prepare(sql));
}

describe('canonical beacon migration', () => {
  test('uses seven simple atomic-import statements with the required command header', () => {
    expect(MIGRATION_SQL).toContain(
      '-- Run: wrangler d1 execute vit-explore --remote --file=explore/migrate-260727-canonical-beacons.sql',
    );
    expect(splitSqlStatements(MIGRATION_SQL)).toHaveLength(7);
    expect(MIGRATION_SQL).not.toMatch(/\bBEGIN\b/i);
    expect(MIGRATION_SQL).not.toMatch(/\bCOMMIT\b/i);
    expect(MIGRATION_SQL).not.toContain("datetime('now')");
  });

  test('merges only the three aliases, recounts facts, and is byte-identical on rerun', () => {
    const { db, env } = createSqliteEnv();
    try {
      seedProductionShape(db);
      expect(db.query('SELECT COUNT(*) AS count FROM beacons').get().count).toBe(22);
      expect(db.query('SELECT COUNT(*) AS count FROM caps').get().count).toBe(63);

      const beforeCaps = db.query('SELECT id, record_json FROM caps ORDER BY id').all();
      const beforeVouches = db.query('SELECT id, record_json FROM vouches ORDER BY id').all();
      const beforeUnrelated = db.query(
        "SELECT * FROM beacons WHERE name LIKE 'vit:unrelated-%' ORDER BY id",
      ).all();

      env.DB.batch(migrationStatements(env));

      expect(db.query('SELECT COUNT(*) AS count FROM beacons').get().count).toBe(19);
      expect(db.query('SELECT COUNT(*) AS count FROM caps').get().count).toBe(63);
      expect(db.query('SELECT COUNT(*) AS count FROM vouches').get().count).toBe(2);
      expect(db.query('SELECT id, record_json FROM caps ORDER BY id').all()).toEqual(beforeCaps);
      expect(db.query('SELECT id, record_json FROM vouches ORDER BY id').all()).toEqual(beforeVouches);
      expect(
        db.query("SELECT * FROM beacons WHERE name LIKE 'vit:unrelated-%' ORDER BY id").all(),
      ).toEqual(beforeUnrelated);

      expect(db.query(
        `SELECT name, cap_count, vouch_count, last_activity
         FROM beacons
         WHERE name IN (?, ?, ?)
         ORDER BY name`,
      ).all(
        PROJECTS.rookery.canonical,
        PROJECTS.thermals.canonical,
        PROJECTS.vmlx.canonical,
      )).toEqual([
        {
          name: PROJECTS.vmlx.canonical,
          cap_count: 2,
          vouch_count: 1,
          last_activity: '2026-07-25 09:39:21',
        },
        {
          name: PROJECTS.thermals.canonical,
          cap_count: 4,
          vouch_count: 0,
          last_activity: '2026-07-23 16:37:48',
        },
        {
          name: PROJECTS.rookery.canonical,
          cap_count: 6,
          vouch_count: 1,
          last_activity: '2026-07-26 06:44:23',
        },
      ]);
      expect(db.query(
        `SELECT COUNT(*) AS count FROM beacons
         WHERE name IN (?, ?, ?)`,
      ).get(
        PROJECTS.rookery.alias,
        PROJECTS.thermals.alias,
        PROJECTS.vmlx.alias,
      ).count).toBe(0);
      expect(db.query(
        `SELECT
           (SELECT COUNT(*) FROM caps WHERE beacon = ?) AS rookery_caps,
           (SELECT COUNT(*) FROM caps WHERE beacon = ?) AS thermals_caps,
           (SELECT COUNT(*) FROM caps WHERE beacon = ?) AS vmlx_caps,
           (SELECT COUNT(*) FROM caps WHERE beacon IN (?, ?, ?)) AS alias_caps`,
      ).get(
        PROJECTS.rookery.canonical,
        PROJECTS.thermals.canonical,
        PROJECTS.vmlx.canonical,
        PROJECTS.rookery.alias,
        PROJECTS.thermals.alias,
        PROJECTS.vmlx.alias,
      )).toEqual({
        rookery_caps: 6,
        thermals_caps: 4,
        vmlx_caps: 2,
        alias_caps: 0,
      });

      const once = snapshot(db);
      env.DB.batch(migrationStatements(env));
      expect(snapshot(db)).toEqual(once);
    } finally {
      db.close();
    }
  });

  test('rolls back fact updates when an intermediate statement fails', () => {
    const { db, env } = createSqliteEnv();
    try {
      seedProductionShape(db);
      const before = snapshot(db);
      const statements = splitSqlStatements(MIGRATION_SQL);
      statements.splice(5, 0, 'UPDATE nonexistent_beacon_table SET value = 1');
      const prepared = statements.map((sql) => env.DB.prepare(sql));

      expect(() => env.DB.batch(prepared)).toThrow(/nonexistent_beacon_table|no such table/i);
      expect(snapshot(db)).toEqual(before);
    } finally {
      db.close();
    }
  });
});
