// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { resolveHandles } from './resolve.js';

const CAP_COLLECTION = 'org.v-it.cap';
const VOUCH_COLLECTION = 'org.v-it.vouch';
const SKILL_COLLECTION = 'org.v-it.skill';
const JETSTREAM_URL = 'wss://jetstream2.us-east.bsky.network/subscribe';
const STREAM_DURATION_MS = 55_000;

function beaconValue(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function incrementCapBeaconStatements(env, beacon) {
  return [
    env.DB.prepare(
      `INSERT INTO beacons (name, cap_count, last_activity)
       VALUES (?, 1, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET
         cap_count = cap_count + 1,
         last_activity = datetime('now')`,
    ).bind(beacon),
  ];
}

function incrementVouchBeaconStatements(env, beacon) {
  return [
    env.DB.prepare(
      `INSERT INTO beacons (name, vouch_count, last_activity)
       VALUES (?, 1, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET
         vouch_count = vouch_count + 1,
         last_activity = datetime('now')`,
    ).bind(beacon),
  ];
}

function decrementCapBeaconStatement(env, beacon) {
  return env.DB.prepare(
    `UPDATE beacons
     SET cap_count = MAX(0, cap_count - 1),
         last_activity = datetime('now')
     WHERE name = ?`,
  ).bind(beacon);
}

function decrementVouchBeaconStatement(env, beacon) {
  return env.DB.prepare(
    `UPDATE beacons
     SET vouch_count = MAX(0, vouch_count - 1),
         last_activity = datetime('now')
     WHERE name = ?`,
  ).bind(beacon);
}

async function processCapEvent(env, did, commit) {
  const { operation, rkey, record, cid } = commit;
  const uri = `at://${did}/${CAP_COLLECTION}/${rkey}`;

  if (operation === 'create' || operation === 'update') {
    const nextBeacon = beaconValue(record?.beacon);
    const existing = await env.DB.prepare('SELECT beacon FROM caps WHERE did = ? AND rkey = ?')
      .bind(did, rkey)
      .first();
    const prevBeacon = beaconValue(existing?.beacon);

    const capKind = typeof record?.kind === 'string' && record.kind.length > 0 ? record.kind : null;

    const stmts = [
      env.DB.prepare(
        `INSERT INTO caps (did, rkey, uri, cid, title, description, ref, beacon, kind, record_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(did, rkey) DO UPDATE SET
           cid = excluded.cid,
           title = excluded.title,
           description = excluded.description,
           ref = excluded.ref,
           beacon = excluded.beacon,
           kind = excluded.kind,
           record_json = excluded.record_json,
           created_at = excluded.created_at`,
      ).bind(
        did,
        rkey,
        uri,
        cid ?? null,
        record.title,
        record.description || '',
        record.ref,
        nextBeacon,
        capKind,
        JSON.stringify(record),
        record.createdAt,
      ),
    ];

    if (!existing && nextBeacon) {
      stmts.push(...incrementCapBeaconStatements(env, nextBeacon));
    } else if (existing && prevBeacon !== nextBeacon) {
      if (prevBeacon) {
        stmts.push(decrementCapBeaconStatement(env, prevBeacon));
      }
      if (nextBeacon) {
        stmts.push(...incrementCapBeaconStatements(env, nextBeacon));
      }
    }

    await env.DB.batch(stmts);
    return;
  }

  if (operation === 'delete') {
    const existing = await env.DB.prepare('SELECT beacon FROM caps WHERE did = ? AND rkey = ?')
      .bind(did, rkey)
      .first();

    const stmts = [
      env.DB.prepare('DELETE FROM caps WHERE did = ? AND rkey = ?').bind(did, rkey),
    ];

    const prevBeacon = beaconValue(existing?.beacon);
    if (prevBeacon) {
      stmts.unshift(decrementCapBeaconStatement(env, prevBeacon));
    }

    await env.DB.batch(stmts);
  }
}

async function processVouchEvent(env, did, commit) {
  const { operation, rkey, record, cid } = commit;
  const uri = `at://${did}/${VOUCH_COLLECTION}/${rkey}`;

  if (operation === 'create' || operation === 'update') {
    const nextBeacon = beaconValue(record?.beacon);
    const existing = await env.DB.prepare('SELECT beacon FROM vouches WHERE did = ? AND rkey = ?')
      .bind(did, rkey)
      .first();
    const prevBeacon = beaconValue(existing?.beacon);

    const vouchKind = typeof record?.kind === 'string' && record.kind.length > 0 ? record.kind : 'endorse';

    const stmts = [
      env.DB.prepare(
        `INSERT INTO vouches (did, rkey, uri, cid, cap_uri, ref, beacon, kind, record_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(did, rkey) DO UPDATE SET
           cid = excluded.cid,
           cap_uri = excluded.cap_uri,
           ref = excluded.ref,
           beacon = excluded.beacon,
           kind = excluded.kind,
           record_json = excluded.record_json,
           created_at = excluded.created_at`,
      ).bind(
        did,
        rkey,
        uri,
        cid ?? null,
        record.subject?.uri,
        record.ref,
        record.beacon ?? null,
        vouchKind,
        JSON.stringify(record),
        record.createdAt,
      ),
    ];

    if (!existing && nextBeacon) {
      stmts.push(...incrementVouchBeaconStatements(env, nextBeacon));
    } else if (existing && prevBeacon !== nextBeacon) {
      if (prevBeacon) {
        stmts.push(decrementVouchBeaconStatement(env, prevBeacon));
      }
      if (nextBeacon) {
        stmts.push(...incrementVouchBeaconStatements(env, nextBeacon));
      }
    }

    await env.DB.batch(stmts);
    return;
  }

  if (operation === 'delete') {
    const existing = await env.DB.prepare('SELECT beacon FROM vouches WHERE did = ? AND rkey = ?')
      .bind(did, rkey)
      .first();

    const stmts = [
      env.DB.prepare('DELETE FROM vouches WHERE did = ? AND rkey = ?').bind(did, rkey),
    ];

    const prevBeacon = beaconValue(existing?.beacon);
    if (prevBeacon) {
      stmts.unshift(decrementVouchBeaconStatement(env, prevBeacon));
    }

    await env.DB.batch(stmts);
  }
}

async function processSkillEvent(env, did, commit) {
  const { operation, rkey, record, cid } = commit;
  const uri = `at://${did}/${SKILL_COLLECTION}/${rkey}`;

  if (operation === 'create' || operation === 'update') {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO skills (did, rkey, uri, cid, name, description, ref, version, tags, record_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(did, rkey) DO UPDATE SET
           cid = excluded.cid,
           name = excluded.name,
           description = excluded.description,
           ref = excluded.ref,
           version = excluded.version,
           tags = excluded.tags,
           record_json = excluded.record_json,
           created_at = excluded.created_at`,
      ).bind(
        did,
        rkey,
        uri,
        cid ?? null,
        record.name,
        record.description || '',
        'skill-' + record.name,
        record.version || null,
        (record.tags || []).join(','),
        JSON.stringify(record),
        record.createdAt,
      ),
    ]);
    return;
  }

  if (operation === 'delete') {
    await env.DB.prepare('DELETE FROM skills WHERE did = ? AND rkey = ?')
      .bind(did, rkey)
      .run();
  }
}

export async function streamEvents(env, cursor) {
  const url = new URL(JETSTREAM_URL);
  url.searchParams.append('wantedCollections', CAP_COLLECTION);
  url.searchParams.append('wantedCollections', VOUCH_COLLECTION);
  url.searchParams.append('wantedCollections', SKILL_COLLECTION);
  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }

  return await new Promise((resolve) => {
    let latestCursor = cursor || null;
    const newDids = new Set();
    const pending = new Set();
    const ws = new WebSocket(url.toString());

    const timeout = setTimeout(() => {
      ws.close();
    }, STREAM_DURATION_MS);

    const finish = async () => {
      clearTimeout(timeout);
      if (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
      if (newDids.size > 0) {
        await resolveHandles([...newDids], env);
      }
      resolve({ latestCursor });
    };

    ws.addEventListener('message', (event) => {
      const task = (async () => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.kind !== 'commit') {
          return;
        }

        if (msg.time_us) {
          latestCursor = String(msg.time_us);
        }

        if (msg.did) {
          newDids.add(msg.did);
        }

        const commit = msg.commit;
        if (!commit) {
          return;
        }

        if (commit.collection === CAP_COLLECTION) {
          await processCapEvent(env, msg.did, commit);
        } else if (commit.collection === VOUCH_COLLECTION) {
          await processVouchEvent(env, msg.did, commit);
        } else if (commit.collection === SKILL_COLLECTION) {
          await processSkillEvent(env, msg.did, commit);
        }
      })();

      pending.add(task);
      task.finally(() => pending.delete(task));
    });

    ws.addEventListener('close', () => {
      void finish();
    });

    ws.addEventListener('error', () => {
      ws.close();
    });
  });
}
