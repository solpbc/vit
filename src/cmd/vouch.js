// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { requireDid } from '../lib/config.js';
import { CAP_COLLECTION } from '../lib/constants.js';
import { restoreAgent } from '../lib/oauth.js';
import { appendLog, readProjectConfig, readFollowing, readLog } from '../lib/vit-dir.js';
import { resolveRef, REF_PATTERN } from '../lib/cap-ref.js';

export default function register(program) {
  program
    .command('vouch')
    .argument('<ref>', 'Three-word cap reference (e.g. fast-cache-invalidation)')
    .description('Publicly endorse a vetted cap')
    .option('--did <did>', 'DID to use')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (ref, opts) => {
      try {
        const { verbose } = opts;

        if (!REF_PATTERN.test(ref)) {
          console.error('invalid ref. expected three lowercase words with dashes (e.g. fast-cache-invalidation)');
          process.exitCode = 1;
          return;
        }

        const did = requireDid(opts);
        if (!did) return;
        if (verbose) console.log(`[verbose] DID: ${did}`);

        const projectConfig = readProjectConfig();
        const beacon = projectConfig.beacon;
        if (!beacon) {
          console.error("no beacon set. run 'vit init' in a project directory first.");
          process.exitCode = 1;
          return;
        }
        if (verbose) console.log(`[verbose] beacon: ${beacon}`);

        const trusted = readLog('trusted.jsonl');
        const trustedEntry = trusted.find(e => e.ref === ref);
        if (!trustedEntry) {
          console.error(`cap '${ref}' is not yet vetted. vet it first:`);
          console.error('');
          console.error(`  vit vet ${ref}`);
          console.error('');
          console.error('after reviewing, trust it with:');
          console.error('');
          console.error(`  vit vet ${ref} --trust`);
          process.exitCode = 1;
          return;
        }
        if (verbose) console.log(`[verbose] trusted entry found, uri: ${trustedEntry.uri}`);

        const { agent } = await restoreAgent(did);
        if (verbose) console.log('[verbose] session restored');

        const following = readFollowing();
        const dids = following.map(e => e.did);
        dids.push(did);
        if (verbose) console.log(`[verbose] querying ${dids.length} accounts`);

        let match = null;
        for (const repoDid of dids) {
          try {
            const res = await agent.com.atproto.repo.listRecords({
              repo: repoDid,
              collection: CAP_COLLECTION,
              limit: 50,
            });
            for (const rec of res.data.records) {
              if (rec.value.beacon !== beacon) continue;
              const recRef = resolveRef(rec.value, rec.cid);
              if (recRef === ref) {
                if (!match || (rec.value.createdAt || '') > (match.value.createdAt || '')) {
                  match = rec;
                }
              }
            }
          } catch (err) {
            if (verbose) console.log(`[verbose] ${repoDid}: error fetching caps: ${err.message}`);
          }
        }

        if (!match) {
          console.error(`no cap found with ref '${ref}' for this beacon.`);
          process.exitCode = 1;
          return;
        }

        const now = new Date().toISOString();
        const likeRecord = {
          $type: 'app.bsky.feed.like',
          subject: {
            uri: match.uri,
            cid: match.cid,
          },
          createdAt: now,
        };
        if (verbose) console.log(`[verbose] creating like for ${match.uri}`);
        const res = await agent.com.atproto.repo.createRecord({
          repo: did,
          collection: 'app.bsky.feed.like',
          record: likeRecord,
        });

        try {
          appendLog('vouched.jsonl', {
            ref,
            uri: match.uri,
            cid: match.cid,
            likeUri: res.data.uri,
            ts: now,
          });
        } catch (logErr) {
          console.error('warning: failed to write vouched.jsonl:', logErr.message);
        }
        if (verbose) console.log('[verbose] logged to vouched.jsonl');

        console.log(`vouched: ${ref} (${match.uri})`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
