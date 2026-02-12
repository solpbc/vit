// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { Agent } from '@atproto/api';
import { loadConfig } from '../lib/config.js';
import { createOAuthClient, createSessionStore } from '../lib/oauth.js';

export default function register(program) {
  program
    .command('skim')
    .description('List caps from the authenticated PDS')
    .option('--did <did>', 'DID to use (reads saved DID from config if not provided)')
    .option('--limit <n>', 'Max records to return', '25')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (opts) => {
      try {
        const { verbose } = opts;
        const envDid = loadConfig().did;
        const did = opts.did || envDid;
        if (verbose) console.log(`[verbose] Config loaded, DID: ${did}`);

        const clientId = `http://localhost?redirect_uri=${encodeURIComponent('http://127.0.0.1')}&scope=${encodeURIComponent('atproto transition:generic')}`;
        const sessionStore = createSessionStore();
        const client = createOAuthClient({
          clientId,
          sessionStore,
          stateStore: {
            set: async () => {},
            get: async () => undefined,
            del: async () => {},
          },
          redirectUri: 'http://127.0.0.1',
        });
        const session = await client.restore(did);
        if (verbose) console.log(`[verbose] Session restored, PDS: ${session.serverMetadata?.issuer}`);
        const agent = new Agent(session);

        const listArgs = {
          repo: did,
          collection: 'org.v-it.cap',
          limit: parseInt(opts.limit, 10),
        };
        if (verbose) console.log(`[verbose] listRecords ${listArgs.collection} limit=${listArgs.limit}`);
        const listRes = await agent.com.atproto.repo.listRecords(listArgs);
        if (verbose) console.log(`[verbose] Received ${listRes.data.records.length} records`);
        for (const rec of listRes.data.records) {
          console.log(
            JSON.stringify({
              ts: new Date().toISOString(),
              pds: session.serverMetadata?.issuer,
              xrpc: 'com.atproto.repo.listRecords',
              record: rec,
            }),
          );
        }
      } catch (e) {
        console.error(e.message);
        process.exitCode = 1;
      }
    });
}
