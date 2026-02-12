// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { loadConfig } from '../lib/config.js';
import { restoreAgent } from '../lib/oauth.js';

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
        const did = opts.did || loadConfig().did;
        if (verbose) console.log(`[verbose] DID: ${did}`);

        const { agent, session } = await restoreAgent(did);
        if (verbose) console.log(`[verbose] Session restored, PDS: ${session.serverMetadata?.issuer}`);

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
