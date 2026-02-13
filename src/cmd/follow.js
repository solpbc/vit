// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { TID } from '@atproto/common-web';
import { FOLLOW_COLLECTION } from '../lib/constants.js';
import { loadConfig } from '../lib/config.js';
import { restoreAgent } from '../lib/oauth.js';

export default function register(program) {
  program
    .command('follow')
    .argument('<handle>', 'Handle to follow (e.g. alice.bsky.social)')
    .description('Follow an account on your PDS')
    .option('-v, --verbose', 'Show step-by-step details')
    .option('--did <did>', 'DID to use (reads saved DID from config if not provided)')
    .action(async (handle, opts) => {
      try {
        const { verbose } = opts;
        handle = handle.replace(/^@/, '');
        const did = opts.did || loadConfig().did;
        if (!did) {
          console.error("No DID configured. Run 'vit login <handle>' first or pass --did.");
          process.exitCode = 1;
          return;
        }
        if (verbose) console.log(`[verbose] DID: ${did}`);

        const { agent, session } = await restoreAgent(did);
        if (verbose) console.log(`[verbose] Session restored, PDS: ${session.serverMetadata?.issuer}`);

        const resolved = await agent.resolveHandle({ handle });
        const targetDid = resolved.data.did;
        if (verbose) console.log(`[verbose] Resolved ${handle} to ${targetDid}`);

        // check if already following
        const listRes = await agent.com.atproto.repo.listRecords({
          repo: did,
          collection: FOLLOW_COLLECTION,
          limit: 100,
        });
        const existing = listRes.data.records.find(r => r.value.subject === targetDid);
        if (existing) {
          console.error(`Already following ${handle} (${targetDid})`);
          process.exitCode = 1;
          return;
        }

        const rkey = TID.nextStr();
        const record = {
          $type: FOLLOW_COLLECTION,
          subject: targetDid,
          createdAt: new Date().toISOString(),
        };
        const putArgs = {
          repo: did,
          collection: FOLLOW_COLLECTION,
          rkey,
          record,
          validate: false,
        };
        if (verbose) console.log(`[verbose] putRecord ${putArgs.collection} rkey=${rkey}`);
        const putRes = await agent.com.atproto.repo.putRecord(putArgs);
        console.log(
          JSON.stringify({
            ts: new Date().toISOString(),
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

  program
    .command('unfollow')
    .argument('<handle>', 'Handle to unfollow (e.g. alice.bsky.social)')
    .description('Unfollow an account on your PDS')
    .option('-v, --verbose', 'Show step-by-step details')
    .option('--did <did>', 'DID to use (reads saved DID from config if not provided)')
    .action(async (handle, opts) => {
      try {
        const { verbose } = opts;
        handle = handle.replace(/^@/, '');
        const did = opts.did || loadConfig().did;
        if (!did) {
          console.error("No DID configured. Run 'vit login <handle>' first or pass --did.");
          process.exitCode = 1;
          return;
        }
        if (verbose) console.log(`[verbose] DID: ${did}`);

        const { agent, session } = await restoreAgent(did);
        if (verbose) console.log(`[verbose] Session restored, PDS: ${session.serverMetadata?.issuer}`);

        const resolved = await agent.resolveHandle({ handle });
        const targetDid = resolved.data.did;
        if (verbose) console.log(`[verbose] Resolved ${handle} to ${targetDid}`);

        const listRes = await agent.com.atproto.repo.listRecords({
          repo: did,
          collection: FOLLOW_COLLECTION,
          limit: 100,
        });
        const match = listRes.data.records.find(r => r.value.subject === targetDid);
        if (!match) {
          console.error(`Not following ${handle} (${targetDid})`);
          process.exitCode = 1;
          return;
        }

        // extract rkey from URI: at://did/collection/rkey
        const rkey = match.uri.split('/').pop();
        if (verbose) console.log(`[verbose] deleteRecord ${FOLLOW_COLLECTION} rkey=${rkey}`);
        await agent.com.atproto.repo.deleteRecord({
          repo: did,
          collection: FOLLOW_COLLECTION,
          rkey,
        });
        console.log(
          JSON.stringify({
            ts: new Date().toISOString(),
            pds: session.serverMetadata?.issuer,
            xrpc: 'com.atproto.repo.deleteRecord',
            collection: FOLLOW_COLLECTION,
            rkey,
            unfollowed: targetDid,
          }),
        );
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  program
    .command('following')
    .description('List accounts you follow on your PDS')
    .option('-v, --verbose', 'Show step-by-step details')
    .option('--did <did>', 'DID to use (reads saved DID from config if not provided)')
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
          collection: FOLLOW_COLLECTION,
          limit: 100,
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
