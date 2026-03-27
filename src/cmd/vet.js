// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { requireDid } from '../lib/config.js';
import { CAP_COLLECTION, SKILL_COLLECTION } from '../lib/constants.js';
import { restoreAgent } from '../lib/oauth.js';
import { appendLog, readProjectConfig, readFollowing, vitDir } from '../lib/vit-dir.js';
import { requireNotAgent, detectCodingAgent } from '../lib/agent.js';
import { resolveRef, REF_PATTERN } from '../lib/cap-ref.js';
import { isSkillRef, isValidSkillRef, nameFromSkillRef } from '../lib/skill-ref.js';
import { mark, brand, name } from '../lib/brand.js';
import { resolvePds, listRecordsFromPds, batchQuery } from '../lib/pds.js';

function ensureGitignore() {
  const gitignorePath = join(vitDir(), '.gitignore');
  const entry = 'dangerous-accept';
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (content.includes(entry)) return;
  }
  appendFileSync(gitignorePath, entry + '\n');
}

export default function register(program) {
  program
    .command('vet')
    .argument('[ref]', 'Cap or skill reference (e.g. fast-cache-invalidation or skill-agent-test-patterns)')
    .description('Review a cap or skill before trusting it')
    .option('--did <did>', 'DID to use')
    .option('--trust', 'Mark the item as locally trusted')
    .option('--dangerous-accept', 'Permanently disable vet gate for this project (human only)')
    .option('--confirm', 'Confirm dangerous-accept, or bypass agent gate with --trust')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (ref, opts) => {
      try {
        // --- dangerous-accept flow ---
        if (opts.dangerousAccept) {
          const gate = requireNotAgent();
          if (!gate.ok) {
            console.error(`${name} vet --dangerous-accept is human-only. agents cannot set this flag.`);
            process.exitCode = 1;
            return;
          }

          if (opts.confirm) {
            // Write the flag file
            const dir = vitDir();
            const acceptPath = join(dir, 'dangerous-accept');
            writeFileSync(acceptPath, JSON.stringify({ acceptedAt: new Date().toISOString() }) + '\n');
            ensureGitignore();
            console.log('dangerous-accept enabled for this project.');
            console.log('');
            console.log('agents can now remix and learn without vetting.');
            console.log('to revoke: delete .vit/dangerous-accept');
          } else {
            console.log('');
            console.log('  WARNING: this permanently disables the vetting safety gate for all');
            console.log('  caps and skills in this project.');
            console.log('');
            console.log('  any agent running in this project can remix caps and learn skills');
            console.log('  without human review. only do this if you trust the agent\'s judgment');
            console.log('  and the network sources you follow.');
            console.log('');
            console.log('  to proceed, confirm: vit vet --dangerous-accept --confirm');
          }
          return;
        }

        // --- Regular vet flow: ref is required ---
        if (!ref) {
          console.error('ref argument is required for vetting. usage: vit vet <ref>');
          process.exitCode = 1;
          return;
        }

        // --- Agent gate ---
        const agent = detectCodingAgent();
        if (agent) {
          if (opts.trust && opts.confirm) {
            // Sandboxed sub-agent pattern — allow it
          } else {
            console.error('vit vet is for human review. agents should not vet directly.');
            console.error('');
            console.error('if you are a sandboxed sub-agent specifically tasked with vetting,');
            console.error('you can bypass this gate:');
            console.error('');
            console.error(`  vit vet ${ref} --trust --confirm`);
            console.error('');
            console.error('this will trust the ref without interactive review. only use this');
            console.error('if you are a dedicated vetting agent running in an isolated context.');
            process.exitCode = 1;
            return;
          }
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

          const { agent: oauthAgent } = await restoreAgent(did);
          if (verbose) console.log('[verbose] session restored');

          // build DID list from following + self
          const following = readFollowing();
          const dids = following.map(e => e.did);
          dids.push(did);

          // fetch caps from each DID, find matching ref
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

          const { agent: oauthAgent } = await restoreAgent(did);
          if (verbose) console.log('[verbose] session restored');

          const following = readFollowing();
          const dids = following.map(e => e.did);
          dids.push(did);

          const allRecords = await batchQuery(dids, async (repoDid) => {
            const pds = await resolvePds(repoDid);
            if (verbose) console.log(`[verbose] ${repoDid}: resolved PDS ${pds}`);
            return (await listRecordsFromPds(pds, repoDid, SKILL_COLLECTION, 50)).records;
          }, { verbose });

          let match = null;
          for (const records of allRecords) {
            for (const rec of records) {
              if (rec.value.name === skillName) {
                if (!match || (rec.value.createdAt || '') > (match.value.createdAt || '')) {
                  match = rec;
                }
              }
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
