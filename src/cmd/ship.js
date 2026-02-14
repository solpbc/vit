// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { TID } from '@atproto/common-web';
import { CAP_COLLECTION } from '../lib/constants.js';
import { loadConfig } from '../lib/config.js';
import { restoreAgent } from '../lib/oauth.js';
import { appendLog, readProjectConfig } from '../lib/vit-dir.js';

export default function register(program) {
  program
    .command('ship')
    .argument('<text>', 'Cap text to publish')
    .description('Publish a cap to your feed')
    .option('-v, --verbose', 'Show step-by-step details')
    .option('--did <did>', 'DID to use (reads saved DID from config if not provided)')
    .requiredOption('--title <title>', 'Short title for the cap')
    .requiredOption('--description <description>', 'Description of the cap')
    .requiredOption('--ref <ref>', 'Three lowercase words with dashes (e.g. fast-cache-invalidation)')
    .action(async (text, opts) => {
      try {
        const { verbose } = opts;
        const did = opts.did || loadConfig().did;
        if (!did) {
          console.error("No DID configured. Run 'vit login <handle>' first or pass --did.");
          process.exitCode = 1;
          return;
        }
        if (verbose) console.log(`[verbose] DID: ${did}`);

        const REF_PATTERN = /^[a-z]+-[a-z]+-[a-z]+$/;
        if (!REF_PATTERN.test(opts.ref)) {
          console.error('error: --ref must be exactly three lowercase words separated by dashes (e.g. fast-cache-invalidation)');
          process.exitCode = 1;
          return;
        }
        const now = new Date().toISOString();

        const { agent, session } = await restoreAgent(did);
        if (verbose) console.log(`[verbose] Session restored, PDS: ${session.serverMetadata?.issuer}`);

        const record = { $type: CAP_COLLECTION, text, title: opts.title, description: opts.description, ref: opts.ref, createdAt: now };
        const projectConfig = readProjectConfig();
        if (projectConfig.beacon) record.beacon = projectConfig.beacon;
        if (verbose && projectConfig.beacon) console.log(`[verbose] Beacon: ${projectConfig.beacon}`);
        const rkey = TID.nextStr();
        if (verbose) console.log(`[verbose] Record built, rkey: ${rkey}`);
        const putArgs = {
          repo: did,
          collection: CAP_COLLECTION,
          rkey,
          record,
          validate: false,
        };
        if (verbose) console.log(`[verbose] putRecord ${putArgs.collection} rkey=${rkey}`);
        const putRes = await agent.com.atproto.repo.putRecord(putArgs);
        try {
          appendLog('caps.jsonl', {
            ts: now,
            did,
            rkey,
            collection: CAP_COLLECTION,
            pds: session.serverMetadata?.issuer,
            uri: putRes.data.uri,
            cid: putRes.data.cid,
          });
        } catch (logErr) {
          console.error('warning: failed to write caps.jsonl:', logErr.message);
        }
        if (verbose) console.log(`[verbose] Log written to caps.jsonl`);
        console.log(
          JSON.stringify({
            ts: now,
            pds: session.serverMetadata?.issuer,
            xrpc: 'com.atproto.repo.putRecord',
            request: putArgs,
            response: putRes.data,
          }),
        );
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
