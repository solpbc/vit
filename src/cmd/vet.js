// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { requireDid } from '../lib/config.js';
import { CAP_COLLECTION, SKILL_COLLECTION } from '../lib/constants.js';
import { restoreAgent } from '../lib/oauth.js';
import { appendLog, readProjectConfig, readFollowing } from '../lib/vit-dir.js';
import { requireNotAgent } from '../lib/agent.js';
import { resolveRef, REF_PATTERN } from '../lib/cap-ref.js';
import { isSkillRef, isValidSkillRef, nameFromSkillRef } from '../lib/skill-ref.js';
import { mark, brand, name } from '../lib/brand.js';
import { resolvePds, listRecordsFromPds } from '../lib/pds.js';

export default function register(program) {
  program
    .command('vet')
    .argument('<ref>', 'Cap or skill reference (e.g. fast-cache-invalidation or skill-agent-test-patterns)')
    .description('Review a cap or skill before trusting it')
    .option('--did <did>', 'DID to use')
    .option('--trust', 'Mark the item as locally trusted')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (ref, opts) => {
      try {
        const gate = requireNotAgent();
        if (!gate.ok) {
          console.error(`${name} vet must be run by a human. run it in your own terminal.`);
          console.error('');
          console.error('vetting requires human review for safety.');
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
        const isSkill = isSkillRef(ref);

        // Validate ref format
        if (isSkill) {
          if (!isValidSkillRef(ref)) {
            console.error('invalid skill ref. expected format: skill-{name} (lowercase letters, numbers, hyphens)');
            process.exitCode = 1;
            return;
          }
        } else {
          if (!REF_PATTERN.test(ref)) {
            console.error('invalid ref. expected three lowercase words with dashes (e.g. fast-cache-invalidation)');
            process.exitCode = 1;
            return;
          }
        }

        const did = requireDid(opts);
        if (!did) return;
        if (verbose) console.log(`[verbose] DID: ${did}`);

        if (!isSkill) {
          // Cap vet requires beacon
          const projectConfig = readProjectConfig();
          const beacon = projectConfig.beacon;
          if (!beacon) {
            console.error(`no beacon set. run '${name} init' in a project directory first.`);
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
              const pds = await resolvePds(repoDid);
              if (verbose) console.log(`[verbose] ${repoDid}: resolved PDS ${pds}`);
              const res = await listRecordsFromPds(pds, repoDid, CAP_COLLECTION, 50);
              for (const rec of res.records) {
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
            console.log(`${mark} trusted: ${ref}`);
            return;
          }

          const author = match.uri.split('/')[2];
          const title = record.title || '';
          const description = record.description || '';
          const text = record.text || '';

          console.log(`=== ${brand} cap review ===`);
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
        } else {
          // Skill vet — no beacon required
          const skillName = nameFromSkillRef(ref);

          const { agent } = await restoreAgent(did);
          if (verbose) console.log('[verbose] session restored');

          const following = readFollowing();
          const dids = following.map(e => e.did);
          dids.push(did);
          if (verbose) console.log(`[verbose] querying ${dids.length} accounts`);

          let match = null;
          for (const repoDid of dids) {
            try {
              const pds = await resolvePds(repoDid);
              if (verbose) console.log(`[verbose] ${repoDid}: resolved PDS ${pds}`);
              const res = await listRecordsFromPds(pds, repoDid, SKILL_COLLECTION, 50);
              for (const rec of res.records) {
                if (rec.value.name === skillName) {
                  if (!match || (rec.value.createdAt || '') > (match.value.createdAt || '')) {
                    match = rec;
                  }
                }
              }
            } catch (err) {
              if (verbose) console.log(`[verbose] ${repoDid}: error fetching skills: ${err.message}`);
            }
          }

          if (!match) {
            console.error(`no skill found with ref '${ref}' from followed accounts.`);
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
            console.log(`${mark} trusted: ${ref}`);
            return;
          }

          const author = match.uri.split('/')[2];

          console.log(`=== ${brand} skill review ===`);
          console.log('Review this skill carefully before trusting it.');
          console.log('');
          console.log(`  Ref:         ${ref}`);
          console.log(`  Name:        ${record.name}`);
          console.log(`  Author:      ${author}`);
          if (record.version) console.log(`  Version:     ${record.version}`);
          if (record.license) console.log(`  License:     ${record.license}`);
          if (record.description) {
            console.log('');
            console.log(`  ${record.description}`);
          }
          if (record.compatibility) {
            console.log('');
            console.log(`  Compatibility: ${record.compatibility}`);
          }
          if (record.text) {
            console.log('');
            console.log('--- SKILL.md ---');
            console.log(record.text);
            console.log('---');
          }
          if (record.resources && record.resources.length > 0) {
            console.log('');
            console.log('Resources:');
            for (const r of record.resources) {
              const desc = r.description ? ` — ${r.description}` : '';
              console.log(`  ${r.path}${desc}`);
            }
          }
          if (record.tags && record.tags.length > 0) {
            console.log('');
            console.log(`  Tags: ${record.tags.join(', ')}`);
          }
          console.log('');
          console.log('To trust this skill, run:');
          console.log('');
          console.log(`  vit vet ${ref} --trust`);
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
