// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { requireDid, loadConfig } from '../lib/config.js';
import { restoreAgent } from '../lib/oauth.js';
import { readFollowing, writeFollowing } from '../lib/vit-dir.js';
import { mark } from '../lib/brand.js';
import { jsonOk, jsonError } from '../lib/json-output.js';

export default function register(program) {
  program
    .command('follow')
    .argument('<handle>', 'Handle to follow (e.g. alice.bsky.social)')
    .description('Add an account to this project\'s following list')
    .option('-v, --verbose', 'Show step-by-step details')
    .option('--json', 'Output as JSON')
    .option('--did <did>', 'DID to use for handle resolution')
    .action(async (handle, opts) => {
      try {
        const { verbose } = opts;
        const vlog = opts.json ? (...a) => console.error(...a) : console.log;
        handle = handle.replace(/^@/, '');

        if (opts.json && !(opts.did || loadConfig().did)) {
          jsonError('no DID configured', "run 'vit login <handle>' first");
          return;
        }
        const did = requireDid(opts);
        if (!did) return;
        if (verbose) vlog(`[verbose] DID: ${did}`);

        const list = readFollowing();
        if (list.some(e => e.handle === handle)) {
          if (opts.json) {
            jsonError(`already following ${handle}`);
            return;
          }
          console.error(`already following ${handle}`);
          process.exitCode = 1;
          return;
        }

        const { agent } = await restoreAgent(did);
        if (verbose) vlog('[verbose] session restored');

        const resolved = await agent.resolveHandle({ handle });
        const targetDid = resolved.data.did;
        if (verbose) vlog(`[verbose] resolved ${handle} to ${targetDid}`);

        list.push({ handle, did: targetDid, followedAt: new Date().toISOString() });
        writeFollowing(list);
        if (opts.json) {
          jsonOk({ handle, did: targetDid, followedAt: list[list.length - 1].followedAt });
          return;
        }
        console.log(`${mark} following ${handle} (${targetDid})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          jsonError(msg);
          return;
        }
        console.error(msg);
        process.exitCode = 1;
      }
    });

  program
    .command('unfollow')
    .argument('<handle>', 'Handle to unfollow (e.g. alice.bsky.social)')
    .description('Remove an account from this project\'s following list')
    .option('-v, --verbose', 'Show step-by-step details')
    .option('--json', 'Output as JSON')
    .action(async (handle, opts) => {
      try {
        const { verbose } = opts;
        const vlog = opts.json ? (...a) => console.error(...a) : console.log;
        handle = handle.replace(/^@/, '');

        const list = readFollowing();
        const filtered = list.filter(e => e.handle !== handle);
        if (filtered.length === list.length) {
          if (opts.json) {
            jsonError(`not following ${handle}`);
            return;
          }
          console.error(`not following ${handle}`);
          process.exitCode = 1;
          return;
        }

        writeFollowing(filtered);
        if (verbose) vlog(`[verbose] removed ${handle} from following list`);
        if (opts.json) {
          jsonOk({ handle });
          return;
        }
        console.log(`${mark} unfollowed ${handle}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          jsonError(msg);
          return;
        }
        console.error(msg);
        process.exitCode = 1;
      }
    });

  program
    .command('following')
    .description('List accounts in this project\'s following list')
    .option('-v, --verbose', 'Show step-by-step details')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const list = readFollowing();
        if (list.length === 0) {
          if (opts.json) {
            jsonOk({ following: [] });
            return;
          }
          console.log('no followings');
          return;
        }
        if (opts.json) {
          jsonOk({ following: list });
          return;
        }
        for (const e of list) {
          console.log(`${e.handle} (${e.did})`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          jsonError(msg);
          return;
        }
        console.error(msg);
        process.exitCode = 1;
      }
    });
}
