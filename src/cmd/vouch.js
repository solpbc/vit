// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { requireDid } from '../lib/config.js';
import { CAP_COLLECTION, SKILL_COLLECTION, VOUCH_COLLECTION } from '../lib/constants.js';
import { TID } from '@atproto/common-web';
import { restoreAgent } from '../lib/oauth.js';
import { appendLog, readProjectConfig, readFollowing, readLog } from '../lib/vit-dir.js';
import { resolveRef, REF_PATTERN } from '../lib/cap-ref.js';
import { isSkillRef, isValidSkillRef, nameFromSkillRef } from '../lib/skill-ref.js';
import { mark, name } from '../lib/brand.js';
import { resolvePds, listRecordsFromPds, batchQuery } from '../lib/pds.js';
import { loadConfig } from '../lib/config.js';
import { jsonOk, jsonError } from '../lib/json-output.js';

export default function register(program) {
  program
    .command('vouch')
    .argument('<ref>', 'Cap or skill reference (e.g. fast-cache-invalidation or skill-agent-test-patterns)')
    .description('Publicly endorse a vetted cap or skill')
    .option('--did <did>', 'DID to use')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (ref, opts) => {
      try {
        const { verbose } = opts;
        const vlog = opts.json ? (...a) => console.error(...a) : console.log;
        const isSkill = isSkillRef(ref);

        // Validate ref format
        if (isSkill) {
          if (!isValidSkillRef(ref)) {
            if (opts.json) {
              jsonError('invalid skill ref', 'expected format: skill-{name}');
              return;
            }
            console.error('invalid skill ref. expected format: skill-{name} (lowercase letters, numbers, hyphens)');
            process.exitCode = 1;
            return;
          }
        } else {
          if (!REF_PATTERN.test(ref)) {
            if (opts.json) {
              jsonError('invalid ref', 'expected three lowercase words with dashes');
              return;
            }
            console.error('invalid ref. expected three lowercase words with dashes (e.g. fast-cache-invalidation)');
            process.exitCode = 1;
            return;
          }
        }

        if (opts.json && !(opts.did || loadConfig().did)) {
          jsonError('no DID configured', "run 'vit login <handle>' first");
          return;
        }
        const did = requireDid(opts);
        if (!did) return;
        if (verbose) vlog(`[verbose] DID: ${did}`);

        if (isSkill) {
          // Skill vouch — no beacon required, check trusted first
          const trusted = readLog('trusted.jsonl');
          const trustedEntry = trusted.find(e => e.ref === ref);
          if (!trustedEntry) {
            if (opts.json) {
              jsonError(`skill '${ref}' is not yet vetted`, `run 'vit vet ${ref}' first`);
              return;
            }
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
          if (verbose) vlog(`[verbose] trusted entry found, uri: ${trustedEntry.uri}`);

          const skillName = nameFromSkillRef(ref);

          const { agent } = await restoreAgent(did);
          if (verbose) vlog('[verbose] session restored');

          const following = readFollowing();
          const dids = following.map(e => e.did);
          dids.push(did);

          const allRecords = await batchQuery(dids, async (repoDid) => {
            const pds = await resolvePds(repoDid);
            if (verbose) vlog(`[verbose] ${repoDid}: resolved PDS ${pds}`);
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
            if (opts.json) {
              jsonError(`no skill found with ref '${ref}'`);
              return;
            }
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
          if (verbose) vlog(`[verbose] creating vouch for ${match.uri}`);
          const rkey = TID.nextStr();
          const res = await agent.com.atproto.repo.putRecord({
            repo: did,
            collection: VOUCH_COLLECTION,
            rkey,
            record: vouchRecord,
            validate: true,
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
          if (verbose) vlog('[verbose] logged to vouched.jsonl');

          if (opts.json) {
            jsonOk({ ref, uri: match.uri, vouchUri: res.data.uri });
            return;
          }
          console.log(`${mark} vouched: ${ref} (${match.uri})`);
        } else {
          // Cap vouch — requires beacon (check beacon before trusted, matching original behavior)
          const projectConfig = readProjectConfig();
          const beacon = projectConfig.beacon;
          if (!beacon) {
            if (opts.json) {
              jsonError('no beacon set', "run 'vit init' first");
              return;
            }
            console.error(`no beacon set. run '${name} init' in a project directory first.`);
            process.exitCode = 1;
            return;
          }
          if (verbose) vlog(`[verbose] beacon: ${beacon}`);

          const trusted = readLog('trusted.jsonl');
          const trustedEntry = trusted.find(e => e.ref === ref);
          if (!trustedEntry) {
            if (opts.json) {
              jsonError(`cap '${ref}' is not yet vetted`, `run 'vit vet ${ref}' first`);
              return;
            }
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
          if (verbose) vlog(`[verbose] trusted entry found, uri: ${trustedEntry.uri}`);

          const { agent } = await restoreAgent(did);
          if (verbose) vlog('[verbose] session restored');

          const following = readFollowing();
          const dids = following.map(e => e.did);
          dids.push(did);

          const allRecords = await batchQuery(dids, async (repoDid) => {
            const pds = await resolvePds(repoDid);
            if (verbose) vlog(`[verbose] ${repoDid}: resolved PDS ${pds}`);
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
            if (opts.json) {
              jsonError(`no cap found with ref '${ref}' for this beacon`);
              return;
            }
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
          if (verbose) vlog(`[verbose] creating vouch for ${match.uri}`);
          const rkey = TID.nextStr();
          const res = await agent.com.atproto.repo.putRecord({
            repo: did,
            collection: VOUCH_COLLECTION,
            rkey,
            record: vouchRecord,
            validate: true,
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
          if (verbose) vlog('[verbose] logged to vouched.jsonl');

          if (opts.json) {
            jsonOk({ ref, uri: match.uri, vouchUri: res.data.uri });
            return;
          }
          console.log(`${mark} vouched: ${ref} (${match.uri})`);
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
