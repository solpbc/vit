// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

export async function resolveHandle(did, env) {
  try {
    const cached = await env.DB.prepare(
      "SELECT handle, fetched_at FROM handles WHERE did = ? AND fetched_at > datetime('now', '-24 hours')",
    )
      .bind(did)
      .first();

    if (cached?.handle) {
      return cached.handle;
    }

    const res = await fetch(`https://plc.directory/${did}`);
    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const handle = Array.isArray(data?.alsoKnownAs)
      ? data.alsoKnownAs.find(value => typeof value === 'string' && value.startsWith('at://'))?.slice(5) ?? null
      : null;

    if (!handle) {
      return null;
    }

    await env.DB.prepare(
      `INSERT INTO handles (did, handle, fetched_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(did) DO UPDATE SET
         handle = excluded.handle,
         fetched_at = excluded.fetched_at`,
    )
      .bind(did, handle)
      .run();

    return handle;
  } catch {
    return null;
  }
}

export async function resolveHandles(dids, env) {
  const handles = new Map();

  for (const did of dids) {
    const handle = await resolveHandle(did, env);
    if (handle) {
      handles.set(did, handle);
    }
  }

  return handles;
}
