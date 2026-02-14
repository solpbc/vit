// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { requireDid } from '../lib/config.js';
import { restoreAgent } from '../lib/oauth.js';
import { readFollowing, writeFollowing } from '../lib/vit-dir.js';

export default function register(program) {
  program
    .command('follow')
    .argument('<handle>', 'Handle to follow (e.g. alice.bsky.social)')
    .description('Add an account to this project\'s following list')
    .option('-v, --verbose', 'Show step-by-step details')
    .option('--did <did>', 'DID to use for handle resolution')
    .action(async (handle, opts) => {
      try {
        const { verbose } = opts;
        handle = handle.replace(/^@/, '');

        const did = requireDid(opts);
        if (!did) return;
        if (verbose) console.log(`[verbose] DID: ${did}`);

        const list = readFollowing();
        if (list.some(e => e.handle === handle)) {
          console.error(`already following ${handle}`);
          process.exitCode = 1;
          return;
        }

        const { agent } = await restoreAgent(did);
        if (verbose) console.log('[verbose] session restored');

        const resolved = await agent.resolveHandle({ handle });
        const targetDid = resolved.data.did;
        if (verbose) console.log(`[verbose] resolved ${handle} to ${targetDid}`);

        list.push({ handle, did: targetDid, followedAt: new Date().toISOString() });
        writeFollowing(list);
        console.log(`following ${handle} (${targetDid})`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  program
    .command('unfollow')
    .argument('<handle>', 'Handle to unfollow (e.g. alice.bsky.social)')
    .description('Remove an account from this project\'s following list')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (handle, opts) => {
      try {
        const { verbose } = opts;
        handle = handle.replace(/^@/, '');

        const list = readFollowing();
        const filtered = list.filter(e => e.handle !== handle);
        if (filtered.length === list.length) {
          console.error(`not following ${handle}`);
          process.exitCode = 1;
          return;
        }

        writeFollowing(filtered);
        if (verbose) console.log(`[verbose] removed ${handle} from following list`);
        console.log(`unfollowed ${handle}`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  program
    .command('following')
    .description('List accounts in this project\'s following list')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (_opts) => {
      try {
        const list = readFollowing();
        if (list.length === 0) {
          console.log('no followings');
          return;
        }
        for (const e of list) {
          console.log(`${e.handle} (${e.did})`);
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
