// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { afterEach, describe, expect, test } from 'bun:test';
import { listRecordsFromPds, resolvePds, resolveHandleFromDid } from '../src/lib/pds.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('pds helpers', () => {
  test('listRecordsFromPds follows pagination cursors and returns all records', async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      const cursor = new URL(String(url)).searchParams.get('cursor');
      const body = cursor === 'next-page'
        ? { records: [{ uri: 'at://did:plc:123/org.v-it.cap/2', value: { text: 'two' } }] }
        : {
            records: [{ uri: 'at://did:plc:123/org.v-it.cap/1', value: { text: 'one' } }],
            cursor: 'next-page',
          };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const res = await listRecordsFromPds('https://pds.example', 'did:plc:123', 'org.v-it.cap');

    expect(res.records).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('limit=100');
    expect(calls[1]).toContain('cursor=next-page');
  });

  test('resolvePds uses .well-known did document for did:web domains', async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({
        service: [{ type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example' }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const pds = await resolvePds('did:web:example.com');

    expect(pds).toBe('https://pds.example');
    expect(calls[0]).toBe('https://example.com/.well-known/did.json');
  });

  test('resolvePds uses path did document for did:web with path segments', async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({
        service: [{ type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example/path' }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const pds = await resolvePds('did:web:example.com:path:segment');

    expect(pds).toBe('https://pds.example/path');
    expect(calls[0]).toBe('https://example.com/path/segment/did.json');
  });

  test('resolvePds still uses plc.directory for did:plc identifiers', async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({
        service: [{ type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example/plc' }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const pds = await resolvePds('did:plc:abc123');

    expect(pds).toBe('https://pds.example/plc');
    expect(calls[0]).toBe('https://plc.directory/did:plc:abc123');
  });

  test('resolveHandleFromDid uses did:web URL for did:web identifiers', async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({
        alsoKnownAs: ['at://alice.example.com'],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const handle = await resolveHandleFromDid('did:web:example.com');

    expect(handle).toBe('alice.example.com');
    expect(calls[0]).toBe('https://example.com/.well-known/did.json');
  });
});
