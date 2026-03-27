// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

const PLC_DIRECTORY = 'https://plc.directory';
const pdsCache = new Map();

async function fetchDidDocument(did) {
  let url;
  if (did.startsWith('did:web:')) {
    const rest = did.slice('did:web:'.length);
    const parts = rest.split(':');
    const domain = decodeURIComponent(parts[0]);
    if (parts.length === 1) {
      url = `https://${domain}/.well-known/did.json`;
    } else {
      url = `https://${domain}/${parts.slice(1).map(decodeURIComponent).join('/')}/did.json`;
    }
  } else {
    url = `${PLC_DIRECTORY}/${did}`;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to resolve DID document for ${did}: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function resolvePds(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  const doc = await fetchDidDocument(did);
  const pds = doc.service?.find(s => s.type === 'AtprotoPersonalDataServer');
  if (!pds?.serviceEndpoint) throw new Error(`no PDS found in DID document for ${did}`);
  pdsCache.set(did, pds.serviceEndpoint);
  return pds.serviceEndpoint;
}

export async function listRecordsFromPds(pdsUrl, repo, collection, limit) {
  const records = [];
  let cursor;
  do {
    const url = new URL('/xrpc/com.atproto.repo.listRecords', pdsUrl);
    url.searchParams.set('repo', repo);
    url.searchParams.set('collection', collection);
    if (limit) url.searchParams.set('limit', String(limit));
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`listRecords failed for ${repo}: ${res.status} ${res.statusText}`);
    const data = await res.json();
    records.push(...data.records);
    cursor = data.cursor;
  } while (cursor);
  return { records };
}

export async function resolveHandleFromDid(did) {
  try {
    const doc = await fetchDidDocument(did);
    const aka = doc.alsoKnownAs?.find(a => a.startsWith('at://'));
    return aka ? aka.replace('at://', '') : did;
  } catch {
    return did;
  }
}

export async function batchQuery(items, fn, { batchSize = 10, verbose = false } = {}) {
  if (verbose) console.log(`[verbose] querying ${items.length} accounts in batches of ${batchSize}`);
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(chunk.map(fn));
    for (let j = 0; j < settled.length; j++) {
      if (settled[j].status === 'fulfilled' && settled[j].value !== undefined) {
        results.push(settled[j].value);
      } else if (settled[j].status === 'rejected' && verbose) {
        console.log(`[verbose] ${chunk[j]}: error: ${settled[j].reason?.message || settled[j].reason}`);
      }
    }
  }
  return results;
}
