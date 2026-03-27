// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resolvePds, resolveHandleFromDid, listRecordsFromPds, batchQuery } from '../src/lib/pds.js';

function jsonResponse(data, { ok = true, status = 200, statusText = 'OK' } = {}) {
  return {
    ok,
    status,
    statusText,
    async json() {
      return data;
    },
  };
}

describe('pds', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('resolvePds', () => {
    test('fetches PLC DID documents from plc.directory', async () => {
      let fetchedUrl;
      global.fetch = async (input) => {
        fetchedUrl = String(input);
        return jsonResponse({
          service: [{ type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example.com' }],
        });
      };

      await expect(resolvePds('did:plc:abc123-pds-test')).resolves.toBe('https://pds.example.com');
      expect(fetchedUrl).toBe('https://plc.directory/did:plc:abc123-pds-test');
    });

    test('fetches root did:web documents from .well-known', async () => {
      let fetchedUrl;
      global.fetch = async (input) => {
        fetchedUrl = String(input);
        return jsonResponse({
          service: [{ type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example.com' }],
        });
      };

      await expect(resolvePds('did:web:example.com')).resolves.toBe('https://pds.example.com');
      expect(fetchedUrl).toBe('https://example.com/.well-known/did.json');
    });

    test('fetches path-based did:web documents from /.../did.json', async () => {
      let fetchedUrl;
      global.fetch = async (input) => {
        fetchedUrl = String(input);
        return jsonResponse({
          service: [{ type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example.com' }],
        });
      };

      await expect(resolvePds('did:web:example.com:user:alice')).resolves.toBe('https://pds.example.com');
      expect(fetchedUrl).toBe('https://example.com/user/alice/did.json');
    });

    test('decodes did:web port encoding', async () => {
      let fetchedUrl;
      global.fetch = async (input) => {
        fetchedUrl = String(input);
        return jsonResponse({
          service: [{ type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example.com' }],
        });
      };

      await expect(resolvePds('did:web:example.com%3A3000')).resolves.toBe('https://pds.example.com');
      expect(fetchedUrl).toBe('https://example.com:3000/.well-known/did.json');
    });

    test('caches per DID', async () => {
      let fetchCount = 0;
      global.fetch = async () => {
        fetchCount++;
        return jsonResponse({
          service: [{ type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://cached.example.com' }],
        });
      };

      await expect(resolvePds('did:plc:cache-test-1')).resolves.toBe('https://cached.example.com');
      await expect(resolvePds('did:plc:cache-test-1')).resolves.toBe('https://cached.example.com');
      expect(fetchCount).toBe(1);
    });

    test('throws when no PDS service is present', async () => {
      global.fetch = async () => jsonResponse({ service: [] });

      await expect(resolvePds('did:plc:no-service-test')).rejects.toThrow(
        'no PDS found in DID document for did:plc:no-service-test',
      );
    });
  });

  describe('resolveHandleFromDid', () => {
    test('returns handle from alsoKnownAs for did:plc', async () => {
      global.fetch = async () => jsonResponse({
        alsoKnownAs: ['at://alice.test'],
      });

      await expect(resolveHandleFromDid('did:plc:handle-test')).resolves.toBe('alice.test');
    });

    test('returns handle from alsoKnownAs for did:web', async () => {
      global.fetch = async () => jsonResponse({
        alsoKnownAs: ['at://bob.test'],
      });

      await expect(resolveHandleFromDid('did:web:example.com:bob')).resolves.toBe('bob.test');
    });

    test('returns DID when fetch fails', async () => {
      global.fetch = async () => {
        throw new Error('network down');
      };

      await expect(resolveHandleFromDid('did:web:example.com:fallback')).resolves.toBe('did:web:example.com:fallback');
    });
  });

  describe('listRecordsFromPds', () => {
    test('returns a single page of records', async () => {
      const seenUrls = [];
      global.fetch = async (input) => {
        seenUrls.push(String(input));
        return jsonResponse({
          records: [{ uri: 'at://did:plc:one/app.test.record/1', cid: 'cid1', value: { foo: 'bar' } }],
        });
      };

      await expect(listRecordsFromPds('https://pds.example.com', 'did:plc:one', 'app.test.record', 50)).resolves.toEqual({
        records: [{ uri: 'at://did:plc:one/app.test.record/1', cid: 'cid1', value: { foo: 'bar' } }],
      });
      expect(seenUrls).toEqual([
        'https://pds.example.com/xrpc/com.atproto.repo.listRecords?repo=did%3Aplc%3Aone&collection=app.test.record&limit=50',
      ]);
    });

    test('accumulates records across cursor pages', async () => {
      const seenUrls = [];
      global.fetch = async (input) => {
        const url = String(input);
        seenUrls.push(url);
        if (!url.includes('cursor=')) {
          return jsonResponse({
            records: [{ uri: 'at://did:plc:two/app.test.record/1', cid: 'cid1', value: { page: 1 } }],
            cursor: 'next-cursor',
          });
        }
        return jsonResponse({
          records: [{ uri: 'at://did:plc:two/app.test.record/2', cid: 'cid2', value: { page: 2 } }],
        });
      };

      await expect(listRecordsFromPds('https://pds.example.com', 'did:plc:two', 'app.test.record', 50)).resolves.toEqual({
        records: [
          { uri: 'at://did:plc:two/app.test.record/1', cid: 'cid1', value: { page: 1 } },
          { uri: 'at://did:plc:two/app.test.record/2', cid: 'cid2', value: { page: 2 } },
        ],
      });
      expect(seenUrls).toEqual([
        'https://pds.example.com/xrpc/com.atproto.repo.listRecords?repo=did%3Aplc%3Atwo&collection=app.test.record&limit=50',
        'https://pds.example.com/xrpc/com.atproto.repo.listRecords?repo=did%3Aplc%3Atwo&collection=app.test.record&limit=50&cursor=next-cursor',
      ]);
    });

    test('throws on non-ok response', async () => {
      global.fetch = async () => jsonResponse({}, { ok: false, status: 500, statusText: 'Server Error' });

      await expect(listRecordsFromPds('https://pds.example.com', 'did:plc:three', 'app.test.record', 50)).rejects.toThrow(
        'listRecords failed for did:plc:three: 500 Server Error',
      );
    });
  });

  describe('batchQuery', () => {
    test('processes items in batches and collects fulfilled results', async () => {
      const active = [];
      const concurrentBatches = [];
      const results = await batchQuery(
        ['a', 'b', 'c', 'd', 'e'],
        async (item) => {
          active.push(item);
          concurrentBatches.push([...active]);
          await Promise.resolve();
          active.splice(active.indexOf(item), 1);
          return item.toUpperCase();
        },
        { batchSize: 2 },
      );

      expect(results).toEqual(['A', 'B', 'C', 'D', 'E']);
      expect(concurrentBatches).toContainEqual(['a', 'b']);
      expect(concurrentBatches).toContainEqual(['c', 'd']);
    });

    test('ignores rejected promises and continues', async () => {
      const results = await batchQuery(
        ['good', 'bad', 'fine'],
        async (item) => {
          if (item === 'bad') throw new Error('boom');
          return item;
        },
        { batchSize: 2 },
      );

      expect(results).toEqual(['good', 'fine']);
    });

    test('logs batch start and errors in verbose mode', async () => {
      const logs = [];
      const originalLog = console.log;
      console.log = (msg) => logs.push(msg);

      try {
        await batchQuery(
          ['did:one', 'did:two'],
          async (item) => {
            if (item === 'did:two') throw new Error('failed item');
            return item;
          },
          { batchSize: 1, verbose: true },
        );
      } finally {
        console.log = originalLog;
      }

      expect(logs).toEqual([
        '[verbose] querying 2 accounts in batches of 1',
        '[verbose] did:two: error: failed item',
      ]);
    });
  });
});
