// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

const PLC_DIRECTORY = 'https://plc.directory';
const pdsCache = new Map();

export async function resolvePds(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  const res = await fetch(`${PLC_DIRECTORY}/${did}`);
  if (!res.ok) throw new Error(`failed to resolve PDS for ${did}: ${res.status} ${res.statusText}`);
  const doc = await res.json();
  const pds = doc.service?.find(s => s.type === 'AtprotoPersonalDataServer');
  if (!pds?.serviceEndpoint) throw new Error(`no PDS found in DID document for ${did}`);
  pdsCache.set(did, pds.serviceEndpoint);
  return pds.serviceEndpoint;
}

export async function listRecordsFromPds(pdsUrl, repo, collection, limit) {
  const url = new URL('/xrpc/com.atproto.repo.listRecords', pdsUrl);
  url.searchParams.set('repo', repo);
  url.searchParams.set('collection', collection);
  if (limit) url.searchParams.set('limit', String(limit));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`listRecords failed for ${repo}: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function resolveHandleFromDid(did) {
  const res = await fetch(`${PLC_DIRECTORY}/${did}`);
  if (!res.ok) return did;
  const doc = await res.json();
  const aka = doc.alsoKnownAs?.find(a => a.startsWith('at://'));
  return aka ? aka.replace('at://', '') : did;
}
