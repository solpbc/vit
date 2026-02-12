// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { loadConfig } from '../lib/config.js';
import { CAP_COLLECTION } from '../lib/constants.js';
import { restoreAgent } from '../lib/oauth.js';

export default function register(program) {
  program
    .command('skim')
    .description('Read caps from the authenticated PDS')
    .option('--did <did>', 'DID to use (reads saved DID from config if not provided)')
    .option('--limit <n>', 'Max records to return', '25')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (opts) => {
      try {
        const { verbose } = opts;
        const did = opts.did || loadConfig().did;
        if (!did) {
          console.error("No DID configured. Run 'vit login <handle>' first or pass --did.");
          process.exitCode = 1;
          return;
        }
        if (verbose) console.log(`[verbose] DID: ${did}`);

        const { agent, session } = await restoreAgent(did);
        if (verbose) console.log(`[verbose] Session restored, PDS: ${session.serverMetadata?.issuer}`);

        const listArgs = {
          repo: did,
          collection: CAP_COLLECTION,
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
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
