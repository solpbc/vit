// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { requireDid } from '../lib/config.js';
import { CAP_COLLECTION } from '../lib/constants.js';
import { restoreAgent } from '../lib/oauth.js';
import { appendLog, readProjectConfig, readFollowing } from '../lib/vit-dir.js';
import { requireNotAgent } from '../lib/agent.js';
import { resolveRef, REF_PATTERN } from '../lib/cap-ref.js';

export default function register(program) {
  program
    .command('vet')
    .argument('<ref>', 'Three-word cap reference (e.g. fast-cache-invalidation)')
    .description('Review a cap before trusting it')
    .option('--did <did>', 'DID to use')
    .option('--trust', 'Mark the cap as locally trusted')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (ref, opts) => {
      try {
        const gate = requireNotAgent();
        if (!gate.ok) {
          console.error('vit vet must be run by a human. run it in your own terminal.');
          console.error('');
          console.error('cap vetting requires human review for safety.');
          console.error('ask your user to run this command in their terminal:');
          console.error('');
          console.error(`  vit vet ${ref}`);
          console.error('');
          console.error('after reviewing, they can trust it with:');
          console.error('');
          console.error(`  vit vet ${ref} --trust`);
          console.error('');
          console.error('once trusted, ask your user to confirm and you can proceed.');
          process.exitCode = 1;
          return;
        }

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

        const { agent } = await restoreAgent(did);
        if (verbose) console.log('[verbose] session restored');

        // build DID list from following + self
        const following = readFollowing();
        const dids = following.map(e => e.did);
        dids.push(did);
        if (verbose) console.log(`[verbose] querying ${dids.length} accounts`);

        // fetch caps from each DID, find matching ref
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

        const record = match.value;

        if (opts.trust) {
          appendLog('trusted.jsonl', {
            ref,
            uri: match.uri,
            trustedAt: new Date().toISOString(),
          });
          console.log(`trusted: ${ref}`);
          return;
        }

        const author = match.uri.split('/')[2];
        const title = record.title || '';
        const description = record.description || '';
        const text = record.text || '';

        console.log('=== Cap Review ===');
        console.log('Review this cap carefully before trusting it.');
        console.log('');
        console.log(`  Ref:     ${ref}`);
        if (title) console.log(`  Title:   ${title}`);
        console.log(`  Author:  ${author}`);
        if (description) {
          console.log('');
          console.log(`  ${description}`);
        }
        if (text) {
          console.log('');
          console.log('--- Text ---');
          console.log(text);
          console.log('---');
        }
        console.log('');
        console.log('To trust this cap, run:');
        console.log('');
        console.log(`  vit vet ${ref} --trust`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
