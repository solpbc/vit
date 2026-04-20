// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { errorMessage } from './error-format.js';

const PLC_DIRECTORY = 'https://plc.directory';
const pdsCache = new Map();

function requestErrorMessage(method, url, err) {
  const code = err?.cause?.code || err?.code;
  if (code === 'ECONNREFUSED') return `could not connect to ${url} (refused)`;
  if (code === 'ENOTFOUND') return `could not resolve ${url}`;
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return `timed out connecting to ${url}`;
  }
  return `request to ${url} failed: ${errorMessage(err)}`;
}

async function fetchJson(method, url) {
  const requestUrl = url.toString();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${method} ${requestUrl} returned ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(`${method} ${requestUrl} returned `)) {
      throw err;
    }
    throw new Error(requestErrorMessage(method, requestUrl, err), { cause: err });
  }
}

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

  return fetchJson('GET', url);
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
    const data = await fetchJson('GET', url);
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
  } catch (err) {
    console.warn(`warning: failed to resolve handle for ${did}: ${errorMessage(err)}`);
    return did;
  }
}

export async function resolveHandle(handle) {
  const url = `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`;
  const data = await fetchJson('GET', url);
  return data.did;
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
