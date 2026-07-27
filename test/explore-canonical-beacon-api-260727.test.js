// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, expect, test } from 'bun:test';
import { handleRequest } from '../explore/src/api.js';
import { processCapEvent } from '../explore/src/jetstream.js';
import { createSqliteEnv } from './explore-d1.js';

const CANONICAL = 'vit:github.com/solpbc/thermals';
const HTTPS_ALIAS = 'https://github.com/solpbc/thermals';
const OTHER = 'vit:tangled.org/solpbc.org/rookery';
const ERROR_BODY = {
  error: 'invalid beacon filter: expected vit:host/owner/repo or a git URL (a scheme URL such as https://host/owner/repo, ssh://git@host/owner/repo, or git://host/owner/repo; SCP-style git@host:owner/repo; or host/owner/repo).',
};

function capCommit(rkey, beacon, createdAt, ref = 'shared-api-ref') {
  return {
    operation: 'create',
    rkey,
    cid: `cid-${rkey}`,
    record: {
      title: `Cap ${rkey}`,
      description: `Description ${rkey}`,
      ref,
      beacon,
      kind: 'test',
      createdAt,
    },
  };
}

function apiRequest(pathname, params = {}) {
  const url = new URL(`https://explore.example${pathname}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return new Request(url);
}

async function responseJson(pathname, params, env) {
  const response = await handleRequest(apiRequest(pathname, params), env);
  return { response, body: await response.json() };
}

async function seedCaps(env) {
  await processCapEvent(
    env,
    'did:plc:api-one',
    capCommit('api-one', HTTPS_ALIAS, '2026-07-27T10:00:00.000Z'),
  );
  await processCapEvent(
    env,
    'did:plc:api-two',
    capCommit('api-two', CANONICAL, '2026-07-27T11:00:00.000Z'),
  );
  await processCapEvent(
    env,
    'did:plc:api-three',
    capCommit('api-three', OTHER, '2026-07-27T12:00:00.000Z', 'other-api-ref'),
  );
}

describe('Explore canonical beacon API filters', () => {
  test('canonical and HTTPS filters return the same pinned cap rows', async () => {
    const { db, env } = createSqliteEnv();
    try {
      await seedCaps(env);

      const canonicalCaps = await responseJson('/api/caps', { beacon: CANONICAL }, env);
      const aliasCaps = await responseJson('/api/caps', { beacon: HTTPS_ALIAS }, env);
      expect(canonicalCaps.response.status).toBe(200);
      expect(aliasCaps.response.status).toBe(200);
      expect(canonicalCaps.body.caps.map((cap) => cap.id)).toEqual([2, 1]);
      expect(aliasCaps.body.caps.map((cap) => cap.id)).toEqual([2, 1]);
      expect(aliasCaps.body).toEqual(canonicalCaps.body);
      expect(aliasCaps.body.caps.every((cap) => cap.beacon === CANONICAL)).toBe(true);

      const canonicalCap = await responseJson(
        '/api/cap',
        { ref: 'shared-api-ref', beacon: CANONICAL },
        env,
      );
      const aliasCap = await responseJson(
        '/api/cap',
        { ref: 'shared-api-ref', beacon: HTTPS_ALIAS },
        env,
      );
      expect(canonicalCap.response.status).toBe(200);
      expect(aliasCap.response.status).toBe(200);
      expect(canonicalCap.body.cap.id).toBe(2);
      expect(aliasCap.body).toEqual(canonicalCap.body);
      expect(aliasCap.body.cap.beacon).toBe(CANONICAL);
    } finally {
      db.close();
    }
  });

  test('trims and deduplicates comma-separated aliases into one predicate', async () => {
    const { db, env } = createSqliteEnv();
    try {
      await seedCaps(env);

      const statements = [];
      const prepare = env.DB.prepare.bind(env.DB);
      env.DB.prepare = (sql) => {
        const statement = prepare(sql);
        return {
          bind(...args) {
            statements.push({ sql, args });
            return statement.bind(...args);
          },
          first() {
            statements.push({ sql, args: [] });
            return statement.first();
          },
          all() {
            statements.push({ sql, args: [] });
            return statement.all();
          },
        };
      };

      const filter = `  ${HTTPS_ALIAS} , ${CANONICAL} , ssh://git@github.com/solpbc/thermals.git  `;
      const result = await responseJson('/api/caps', { beacon: filter }, env);

      expect(result.response.status).toBe(200);
      expect(result.body.caps.map((cap) => cap.id)).toEqual([2, 1]);
      expect(statements).toHaveLength(1);
      expect(statements[0].sql).toContain('c.beacon IN (?)');
      expect(statements[0].args).toEqual([CANONICAL, 50]);
    } finally {
      db.close();
    }
  });

  test('rejects an invalid member in a mixed filter before querying D1', async () => {
    const { db, env } = createSqliteEnv();
    try {
      await seedCaps(env);
      env.DB.prepare = () => {
        throw new Error('D1 must not be queried for an invalid beacon filter');
      };

      const mixed = `${CANONICAL},not a url`;
      const caps = await responseJson('/api/caps', { beacon: mixed }, env);
      expect(caps.response.status).toBe(400);
      expect(caps.body).toEqual(ERROR_BODY);

      const cap = await responseJson(
        '/api/cap',
        { ref: 'shared-api-ref', beacon: mixed },
        env,
      );
      expect(cap.response.status).toBe(400);
      expect(cap.body).toEqual(ERROR_BODY);
    } finally {
      db.close();
    }
  });

  test('keeps an empty beacon parameter equivalent to no filter', async () => {
    const { db, env } = createSqliteEnv();
    try {
      await seedCaps(env);

      const emptyCaps = await responseJson('/api/caps', { beacon: '' }, env);
      const allCaps = await responseJson('/api/caps', {}, env);
      expect(emptyCaps.response.status).toBe(200);
      expect(emptyCaps.body).toEqual(allCaps.body);
      expect(emptyCaps.body.caps.map((cap) => cap.id)).toEqual([3, 2, 1]);

      const emptyCap = await responseJson(
        '/api/cap',
        { ref: 'shared-api-ref', beacon: '' },
        env,
      );
      expect(emptyCap.response.status).toBe(200);
      expect(emptyCap.body.cap.id).toBe(2);
    } finally {
      db.close();
    }
  });
});
