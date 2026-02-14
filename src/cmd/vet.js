// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { loadConfig } from '../lib/config.js';
import { restoreAgent } from '../lib/oauth.js';
import { appendLog } from '../lib/vit-dir.js';
import { requireNotAgent } from '../lib/agent.js';
import { resolveRef } from '../lib/cap-ref.js';

export default function register(program) {
  program
    .command('vet')
    .argument('<cap-ref>', 'AT URI of the cap to review (e.g. at://did:plc:.../org.v-it.cap/...)')
    .description('Review a cap before trusting it')
    .option('--did <did>', 'DID to use (reads saved DID from config if not provided)')
    .option('--trust', 'Mark the cap as locally trusted')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (capRef, opts) => {
      try {
        const gate = requireNotAgent();
        if (!gate.ok) {
          console.error(`vit vet cannot run inside ${gate.name} (detected ${gate.envVar}=1).`);
          console.error('');
          console.error('Cap vetting requires human review for safety.');
          console.error('Ask your user to run this command in their terminal:');
          console.error('');
          console.error(`  vit vet ${capRef}`);
          console.error('');
          console.error('After reviewing, they can trust it with:');
          console.error('');
          console.error(`  vit vet ${capRef} --trust`);
          console.error('');
          console.error('Once trusted, ask your user to confirm and you can proceed.');
          process.exitCode = 1;
          return;
        }

        const { verbose } = opts;

        const parts = capRef.split('/');
        // at://did:plc:xxx/org.v-it.cap/tid -> ['at:', '', 'did:plc:xxx', 'org.v-it.cap', 'tid']
        if (parts.length < 5 || parts[0] !== 'at:' || !parts[2] || !parts[3] || !parts[4]) {
          console.error('Invalid cap reference. Expected AT URI: at://did:plc:.../org.v-it.cap/...');
          process.exitCode = 1;
          return;
        }
        const repo = parts[2];
        const collection = parts[3];
        const rkey = parts[4];
        if (verbose) console.log(`[verbose] Parsed URI repo=${repo} collection=${collection} rkey=${rkey}`);

        const did = opts.did || loadConfig().did;
        if (!did) {
          console.error("No DID configured. Run 'vit login <handle>' first or pass --did.");
          process.exitCode = 1;
          return;
        }
        if (verbose) console.log(`[verbose] DID: ${did}`);

        const { agent, session } = await restoreAgent(did);
        if (verbose) console.log(`[verbose] Session restored, PDS: ${session.serverMetadata?.issuer}`);

        if (verbose) console.log(`[verbose] Fetching ${collection} from ${repo} rkey=${rkey}`);
        const res = await agent.com.atproto.repo.getRecord({ repo, collection, rkey });
        const record = res.data.value;

        if (opts.trust) {
          appendLog('trusted.jsonl', {
            uri: capRef,
            trustedAt: new Date().toISOString(),
          });
          console.log(`Trusted: ${capRef}`);
          return;
        }

        const author = repo;
        const time = record.createdAt || 'unknown';
        const beacon = record.beacon || 'none';
        const text = record.text || '';
        const ref = resolveRef(record, res.data.cid);

        console.log('=== Cap Review ===');
        console.log('Review this cap carefully before trusting it.');
        console.log('');
        console.log(`  Author:  ${author}`);
        console.log(`  Time:    ${time}`);
        console.log(`  Beacon:  ${beacon}`);
        console.log(`  Ref:     ${ref}`);
        console.log('');
        console.log('--- Text ---');
        console.log(text);
        console.log('---');
        console.log('');
        console.log('To trust this cap, run:');
        console.log('');
        console.log(`  vit vet ${capRef} --trust`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
