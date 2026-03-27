// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

const PLC_DIRECTORY = 'https://plc.directory';
const pdsCache = new Map();

function didDocUrl(did) {
  if (did.startsWith('did:web:')) {
    const parts = did.slice('did:web:'.length).split(':');
    const domain = decodeURIComponent(parts[0]);
    const path = parts.slice(1).map(decodeURIComponent).join('/');
    return path
      ? `https://${domain}/${path}/did.json`
      : `https://${domain}/.well-known/did.json`;
  }
  return `${PLC_DIRECTORY}/${did}`;
}

export async function resolvePds(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  const res = await fetch(didDocUrl(did));
  if (!res.ok) throw new Error(`failed to resolve PDS for ${did}: ${res.status} ${res.statusText}`);
  const doc = await res.json();
  const pds = doc.service?.find(s => s.type === 'AtprotoPersonalDataServer');
  if (!pds?.serviceEndpoint) throw new Error(`no PDS found in DID document for ${did}`);
  pdsCache.set(did, pds.serviceEndpoint);
  return pds.serviceEndpoint;
}

export async function listRecordsFromPds(pdsUrl, repo, collection) {
  const all = [];
  let cursor;
  do {
    const url = new URL('/xrpc/com.atproto.repo.listRecords', pdsUrl);
    url.searchParams.set('repo', repo);
    url.searchParams.set('collection', collection);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`listRecords failed for ${repo}: ${res.status} ${res.statusText}`);
    const data = await res.json();
    all.push(...(data.records || []));
    cursor = data.cursor;
  } while (cursor);
  return { records: all };
}

export async function resolveHandleFromDid(did) {
  const res = await fetch(didDocUrl(did));
  if (!res.ok) return did;
  const doc = await res.json();
  const aka = doc.alsoKnownAs?.find(a => a.startsWith('at://'));
  return aka ? aka.replace('at://', '') : did;
}

export async function queryDidsInParallel(dids, queryFn, { concurrency = 10 } = {}) {
  const results = [];
  for (let i = 0; i < dids.length; i += concurrency) {
    const batch = dids.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(queryFn));
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error(`warning: query failed: ${result.reason?.message || result.reason}`);
      }
    }
  }
  return results;
}
