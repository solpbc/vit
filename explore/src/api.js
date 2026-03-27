// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function parseLimit(value) {
  const parsed = Number.parseInt(value ?? '50', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(parsed, 100);
}

function parseCursor(value) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const { pathname, searchParams } = url;

  if (request.method !== 'GET') {
    return json({ error: 'method not allowed' }, 405);
  }

  if (pathname === '/api/caps') {
    const cursor = parseCursor(searchParams.get('cursor'));
    const limit = parseLimit(searchParams.get('limit'));
    const beacon = searchParams.get('beacon');

    const conditions = [];
    const bindings = [];

    if (beacon) {
      conditions.push('c.beacon = ?');
      bindings.push(beacon);
    }

    if (cursor) {
      conditions.push('c.id < ?');
      bindings.push(cursor);
    }

    let sql = 'SELECT c.*, h.handle FROM caps c LEFT JOIN handles h ON c.did = h.did';
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY c.id DESC LIMIT ?';
    bindings.push(limit);

    const { results } = await env.DB.prepare(sql).bind(...bindings).all();
    return json({
      caps: results,
      cursor: results.length > 0 ? results[results.length - 1].id : null,
    });
  }

  if (pathname === '/api/cap') {
    const ref = searchParams.get('ref');
    const uri = searchParams.get('uri');
    const beacon = searchParams.get('beacon');

    if (!ref && !uri) {
      return json({ error: 'ref or uri is required' }, 400);
    }

    if (ref && uri) {
      return json({ error: 'provide ref or uri, not both' }, 400);
    }

    const conditions = [];
    const bindings = [];

    if (uri) {
      conditions.push('c.uri = ?');
      bindings.push(uri);
    }

    if (ref) {
      conditions.push('c.ref = ?');
      bindings.push(ref);

      if (beacon) {
        conditions.push('c.beacon = ?');
        bindings.push(beacon);
      }
    }

    let sql = `SELECT c.*, h.handle,
      (SELECT COUNT(*) FROM vouches v WHERE v.cap_uri = c.uri) as vouch_count
     FROM caps c
     LEFT JOIN handles h ON c.did = h.did
     WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY c.created_at DESC LIMIT 1';

    const result = await env.DB.prepare(sql).bind(...bindings).first();
    return json({ cap: result });
  }

  if (pathname === '/api/vouches') {
    const capUri = searchParams.get('cap_uri');
    if (!capUri) {
      return json({ error: 'cap_uri is required' }, 400);
    }

    const { results } = await env.DB.prepare(
      `SELECT v.*, h.handle
       FROM vouches v
       LEFT JOIN handles h ON v.did = h.did
       WHERE v.cap_uri = ?
       ORDER BY v.id DESC`,
    )
      .bind(capUri)
      .all();

    return json({ vouches: results });
  }

  if (pathname === '/api/beacons') {
    const { results } = await env.DB.prepare('SELECT * FROM beacons ORDER BY last_activity DESC').all();
    return json({ beacons: results });
  }

  if (pathname === '/api/skills') {
    const cursor = parseCursor(searchParams.get('cursor'));
    const limit = parseLimit(searchParams.get('limit'));
    const tag = searchParams.get('tag');

    const conditions = [];
    const bindings = [];

    if (tag) {
      conditions.push('INSTR(s.tags, ?) > 0');
      bindings.push(tag);
    }

    if (cursor) {
      conditions.push('s.id < ?');
      bindings.push(cursor);
    }

    let sql = 'SELECT s.*, h.handle FROM skills s LEFT JOIN handles h ON s.did = h.did';
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY s.id DESC LIMIT ?';
    bindings.push(limit);

    const { results } = await env.DB.prepare(sql).bind(...bindings).all();
    return json({
      skills: results,
      cursor: results.length > 0 ? results[results.length - 1].id : null,
    });
  }

  if (pathname === '/api/skill') {
    const name = searchParams.get('name');
    const uri = searchParams.get('uri');

    if (!name && !uri) {
      return json({ error: 'name or uri is required' }, 400);
    }

    if (name && uri) {
      return json({ error: 'provide name or uri, not both' }, 400);
    }

    const conditions = [];
    const bindings = [];

    if (uri) {
      conditions.push('s.uri = ?');
      bindings.push(uri);
    }

    if (name) {
      conditions.push('s.name = ?');
      bindings.push(name);
    }

    let sql = `SELECT s.*, h.handle,
      (SELECT COUNT(*) FROM vouches v WHERE v.cap_uri = s.uri) as vouch_count
     FROM skills s
     LEFT JOIN handles h ON s.did = h.did
     WHERE ${conditions.join(' AND ')}`;
    sql += ' ORDER BY s.created_at DESC LIMIT 1';

    const result = await env.DB.prepare(sql).bind(...bindings).first();
    return json({ skill: result });
  }

  if (pathname === '/api/stats') {
    const [caps, vouches, beacons, dids, skills, skillPubs] = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) as count FROM caps'),
      env.DB.prepare('SELECT COUNT(*) as count FROM vouches'),
      env.DB.prepare('SELECT COUNT(*) as count FROM beacons'),
      env.DB.prepare('SELECT COUNT(DISTINCT did) as count FROM caps'),
      env.DB.prepare('SELECT COUNT(*) as count FROM skills'),
      env.DB.prepare('SELECT COUNT(DISTINCT did) as count FROM skills'),
    ]);

    return json({
      total_caps: caps.results[0]?.count ?? 0,
      total_vouches: vouches.results[0]?.count ?? 0,
      total_beacons: beacons.results[0]?.count ?? 0,
      active_dids: dids.results[0]?.count ?? 0,
      total_skills: skills.results[0]?.count ?? 0,
      skill_publishers: skillPubs.results[0]?.count ?? 0,
    });
  }

  return json({ error: 'not found' }, 404);
}
