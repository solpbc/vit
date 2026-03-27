// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { requireDid } from '../lib/config.js';
import { CAP_COLLECTION, SKILL_COLLECTION, VOUCH_COLLECTION } from '../lib/constants.js';
import { TID } from '@atproto/common-web';
import { restoreAgent } from '../lib/oauth.js';
import { appendLog, readProjectConfig, readFollowing, readLog } from '../lib/vit-dir.js';
import { resolveRef, REF_PATTERN } from '../lib/cap-ref.js';
import { isSkillRef, isValidSkillRef, nameFromSkillRef } from '../lib/skill-ref.js';
import { mark, name } from '../lib/brand.js';
import { resolvePds, listRecordsFromPds, queryDidsInParallel } from '../lib/pds.js';

export default function register(program) {
  program
    .command('vouch')
    .argument('<ref>', 'Cap or skill reference (e.g. fast-cache-invalidation or skill-agent-test-patterns)')
    .description('Publicly endorse a vetted cap or skill')
    .option('--did <did>', 'DID to use')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (ref, opts) => {
      try {
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

        if (isSkill) {
          // Skill vouch — no beacon required, check trusted first
          const trusted = readLog('trusted.jsonl');
          const trustedEntry = trusted.find(e => e.ref === ref);
          if (!trustedEntry) {
            console.error(`skill '${ref}' is not yet vetted. vet it first:`);
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

          const skillName = nameFromSkillRef(ref);

          const { agent } = await restoreAgent(did);
          if (verbose) console.log('[verbose] session restored');

          const following = readFollowing();
          const dids = following.map(e => e.did);
          dids.push(did);
          if (verbose) console.log(`[verbose] querying ${dids.length} accounts`);

          let match = null;
          await queryDidsInParallel(dids, async (repoDid) => {
            const pds = await resolvePds(repoDid);
            if (verbose) console.log(`[verbose] ${repoDid}: resolved PDS ${pds}`);
            const res = await listRecordsFromPds(pds, repoDid, SKILL_COLLECTION);
            for (const rec of res.records) {
              if (rec.value.name === skillName) {
                if (!match || (rec.value.createdAt || '') > (match.value.createdAt || '')) {
                  match = rec;
                }
              }
            }
          });

          if (!match) {
            console.error(`no skill found with ref '${ref}' from followed accounts.`);
            process.exitCode = 1;
            return;
          }

          const now = new Date().toISOString();
          const vouchRecord = {
            $type: VOUCH_COLLECTION,
            subject: {
              uri: match.uri,
              cid: match.cid,
            },
            createdAt: now,
            ref,
            // No beacon for skill vouches
          };
          if (verbose) console.log(`[verbose] creating vouch for ${match.uri}`);
          const rkey = TID.nextStr();
          const res = await agent.com.atproto.repo.putRecord({
            repo: did,
            collection: VOUCH_COLLECTION,
            rkey,
            record: vouchRecord,
            validate: false,
          });

          try {
            appendLog('vouched.jsonl', {
              ref,
              uri: match.uri,
              cid: match.cid,
              vouchUri: res.data.uri,
              ts: now,
            });
          } catch (logErr) {
            console.error('warning: failed to write vouched.jsonl:', logErr.message);
          }
          if (verbose) console.log('[verbose] logged to vouched.jsonl');

          console.log(`${mark} vouched: ${ref} (${match.uri})`);
        } else {
          // Cap vouch — requires beacon (check beacon before trusted, matching original behavior)
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
          await queryDidsInParallel(dids, async (repoDid) => {
            const pds = await resolvePds(repoDid);
            if (verbose) console.log(`[verbose] ${repoDid}: resolved PDS ${pds}`);
            const res = await listRecordsFromPds(pds, repoDid, CAP_COLLECTION);
            for (const rec of res.records) {
              if (rec.value.beacon !== beacon) continue;
              const recRef = resolveRef(rec.value, rec.cid);
              if (recRef === ref) {
                if (!match || (rec.value.createdAt || '') > (match.value.createdAt || '')) {
                  match = rec;
                }
              }
            }
          });

          if (!match) {
            console.error(`no cap found with ref '${ref}' for this beacon.`);
            process.exitCode = 1;
            return;
          }

          const now = new Date().toISOString();
          const vouchRecord = {
            $type: VOUCH_COLLECTION,
            subject: {
              uri: match.uri,
              cid: match.cid,
            },
            createdAt: now,
            ref,
            beacon,
          };
          if (verbose) console.log(`[verbose] creating vouch for ${match.uri}`);
          const rkey = TID.nextStr();
          const res = await agent.com.atproto.repo.putRecord({
            repo: did,
            collection: VOUCH_COLLECTION,
            rkey,
            record: vouchRecord,
            validate: false,
          });

          try {
            appendLog('vouched.jsonl', {
              ref,
              uri: match.uri,
              cid: match.cid,
              vouchUri: res.data.uri,
              beacon,
              ts: now,
            });
          } catch (logErr) {
            console.error('warning: failed to write vouched.jsonl:', logErr.message);
          }
          if (verbose) console.log('[verbose] logged to vouched.jsonl');

          console.log(`${mark} vouched: ${ref} (${match.uri})`);
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
