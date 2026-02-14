// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { requireDid } from '../lib/config.js';
import { CAP_COLLECTION } from '../lib/constants.js';
import { restoreAgent } from '../lib/oauth.js';
import { readProjectConfig, readFollowing } from '../lib/vit-dir.js';
import { requireAgent } from '../lib/agent.js';
import { resolveRef } from '../lib/cap-ref.js';

export default function register(program) {
  program
    .command('skim')
    .description('Read caps from followed accounts, filtered by beacon')
    .option('--did <did>', 'DID to use')
    .option('--handle <handle>', 'Show caps from a specific handle only')
    .option('--limit <n>', 'Max caps to display', '25')
    .option('--json', 'Output as JSON array')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (opts) => {
      try {
        const gate = requireAgent();
        if (!gate.ok) {
          console.error('vit skim should be run by a coding agent (e.g. claude code, gemini cli).');
          console.error("open your agent and ask it to run 'vit skim' for you.");
          process.exitCode = 1;
          return;
        }

        const { verbose } = opts;
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

        const { agent } = await restoreAgent(did);
        if (verbose) console.log('[verbose] session restored');

        // build list of DIDs to query
        let dids;
        if (opts.handle) {
          const handle = opts.handle.replace(/^@/, '');
          const resolved = await agent.resolveHandle({ handle });
          dids = [resolved.data.did];
          if (verbose) console.log(`[verbose] resolved ${handle} to ${resolved.data.did}`);
        } else {
          const following = readFollowing();
          dids = following.map(e => e.did);
          dids.push(did);
          if (verbose) console.log(`[verbose] querying ${dids.length} accounts (${dids.length - 1} follows + self)`);
        }

        // fetch caps from each DID
        const allCaps = [];
        for (const repoDid of dids) {
          try {
            const res = await agent.com.atproto.repo.listRecords({
              repo: repoDid,
              collection: CAP_COLLECTION,
              limit: 50,
            });
            const caps = res.data.records.filter(r => r.value.beacon === beacon);
            if (verbose) console.log(`[verbose] ${repoDid}: ${res.data.records.length} caps, ${caps.length} matching beacon`);
            allCaps.push(...caps);
          } catch (err) {
            if (verbose) console.log(`[verbose] ${repoDid}: error fetching caps: ${err.message}`);
          }
        }

        // sort by createdAt descending
        allCaps.sort((a, b) => {
          const ta = a.value.createdAt || '';
          const tb = b.value.createdAt || '';
          return tb.localeCompare(ta);
        });

        // apply limit
        const limit = parseInt(opts.limit, 10);
        const capped = allCaps.slice(0, limit);

        if (opts.json) {
          console.log(JSON.stringify(capped, null, 2));
        } else {
          if (capped.length === 0) {
            console.log('no caps found for this beacon.');
          }
          for (const rec of capped) {
            const ref = resolveRef(rec.value, rec.cid);
            const title = rec.value.title || '';
            const description = rec.value.description || '';
            console.log(`ref: ${ref}`);
            if (title) console.log(`title: ${title}`);
            if (description) console.log(`description: ${description}`);
            console.log();
          }
          console.log('---');
          console.log("hint: tell your user to run 'vit vet <ref>' in another terminal for any cap they want to review.");
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
