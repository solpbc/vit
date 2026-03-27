// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { requireDid } from '../lib/config.js';
import { CAP_COLLECTION } from '../lib/constants.js';
import { restoreAgent } from '../lib/oauth.js';
import { readProjectConfig, readFollowing, readLog } from '../lib/vit-dir.js';
import { requireAgent, detectCodingAgent } from '../lib/agent.js';
import { shouldBypassVet } from '../lib/trust-gate.js';
import { resolveRef, REF_PATTERN } from '../lib/cap-ref.js';
import { brand, name } from '../lib/brand.js';
import { resolvePds, listRecordsFromPds, batchQuery } from '../lib/pds.js';

export default function register(program) {
  program
    .command('remix')
    .argument('<ref>', 'Three-word cap reference (e.g. fast-cache-invalidation)')
    .description('Derive a vetted cap into the local codebase')
    .option('--did <did>', 'DID to use')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (ref, opts) => {
      try {
        const gate = requireAgent();
        if (!gate.ok) {
          console.error(`${name} remix should be run by a coding agent (e.g. claude code, gemini cli).`);
          console.error(`open your agent and ask it to run '${name} remix' for you.`);
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
          console.error(`no beacon set. run '${name} init' in a project directory first.`);
          process.exitCode = 1;
          return;
        }
        if (verbose) console.log(`[verbose] beacon: ${beacon}`);

        const trusted = readLog('trusted.jsonl');
        const trustedEntry = trusted.find(e => e.ref === ref);
        if (!trustedEntry) {
          const trustGate = shouldBypassVet();
          if (!trustGate.bypass) {
            console.error(`cap '${ref}' is not trusted. ask the user to vet it first:`);
            console.error('');
            console.error(`  vit vet ${ref}`);
            console.error('');
            console.error('after reviewing, they can trust it with:');
            console.error('');
            console.error(`  vit vet ${ref} --trust`);
            if (detectCodingAgent()) {
              console.error('');
              console.error('or, to trust all items without review:');
              console.error('');
              console.error('  vit vet --dangerous-accept --confirm');
            }
            process.exitCode = 1;
            return;
          }
          if (verbose) console.log(`[verbose] vet gate bypassed: ${trustGate.reason}`);
        }
        if (verbose && trustedEntry) console.log(`[verbose] trusted entry found, uri: ${trustedEntry.uri}`);

        const { agent } = await restoreAgent(did);
        if (verbose) console.log('[verbose] session restored');

        const following = readFollowing();
        const dids = following.map(e => e.did);
        dids.push(did);

        const allRecords = await batchQuery(dids, async (repoDid) => {
          const pds = await resolvePds(repoDid);
          if (verbose) console.log(`[verbose] ${repoDid}: resolved PDS ${pds}`);
          return (await listRecordsFromPds(pds, repoDid, CAP_COLLECTION, 50)).records;
        }, { verbose });

        let match = null;
        for (const records of allRecords) {
          for (const rec of records) {
            if (rec.value.beacon !== beacon) continue;
            const recRef = resolveRef(rec.value, rec.cid);
            if (recRef === ref) {
              if (!match || (rec.value.createdAt || '') > (match.value.createdAt || '')) {
                match = rec;
              }
            }
          }
        }

        if (!match) {
          console.error(`no cap found with ref '${ref}' for this beacon.`);
          process.exitCode = 1;
          return;
        }

        const record = match.value;
        const author = match.uri.split('/')[2];
        const title = record.title || ref;
        const description = record.description || '';
        const text = record.text || '';

        console.log(`# ${brand} remix: ${title}`);
        console.log('');
        console.log(`ref: ${ref}`);
        console.log(`author: ${author}`);
        if (description) console.log(`description: ${description}`);
        console.log('');
        console.log('---');
        console.log('');
        console.log('you are remixing a vetted cap into the current codebase.');
        console.log('create a thorough implementation plan that:');
        console.log('');
        console.log('1. adapts the cap to this repo\'s architecture, conventions, and existing code');
        console.log('2. follows local guidelines (CLAUDE.md, project conventions, coding standards)');
        console.log('3. identifies all files to create or modify');
        console.log('4. specifies tests to add or update');
        console.log('5. notes any dependencies or migrations needed');
        console.log('');
        console.log('do not apply the cap blindly. produce a well-researched plan first.');
        console.log('');
        console.log('---');
        console.log('');
        console.log('## cap content');
        console.log('');
        console.log(text);
      } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
      }
    });
}
