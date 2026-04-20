// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { requireDid } from '../lib/config.js';
import { CAP_COLLECTION, SKILL_COLLECTION, VOUCH_COLLECTION } from '../lib/constants.js';
import { TID } from '@atproto/common-web';
import { restoreAgent } from '../lib/oauth.js';
import { appendLog, readBeaconSet, readFollowing, readLog } from '../lib/vit-dir.js';
import { resolveRef, REF_PATTERN } from '../lib/cap-ref.js';
import { isSkillRef, isValidSkillRef, nameFromSkillRef } from '../lib/skill-ref.js';
import { mark, name } from '../lib/brand.js';
import { resolvePds, listRecordsFromPds, batchQuery } from '../lib/pds.js';
import { loadConfig } from '../lib/config.js';
import { jsonOk, jsonError } from '../lib/json-output.js';
import { formatError } from '../lib/error-format.js';

export default function register(program) {
  program
    .command('vouch')
    .argument('<ref>', 'Cap or skill reference (e.g. fast-cache-invalidation or skill-agent-test-patterns)')
    .description('Publicly endorse a vetted cap or skill, or signal demand with --kind want')
    .option('--did <did>', 'DID to use')
    .option('--kind <kind>', 'Vouch intent: endorse (default, quality signal) or want (demand signal)')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (ref, opts) => {
      try {
        const { verbose } = opts;
        const vlog = opts.json ? (...a) => console.error(...a) : console.log;
        const isSkill = isSkillRef(ref);

        // Validate --kind if provided
        if (opts.kind) {
          const validVouchKinds = ['endorse', 'want'];
          if (!validVouchKinds.includes(opts.kind)) {
            if (opts.json) {
              jsonError(`--kind must be one of: ${validVouchKinds.join(', ')}`);
              return;
            }
            console.error(`error: --kind must be one of: ${validVouchKinds.join(', ')}`);
            process.exitCode = 1;
            return;
          }
        }

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
            console.error('');
            console.error('hint: skills appear from accounts you follow and your own.');
            console.error(`  vit following             check who you're following`);
            console.error(`  vit explore skills        browse skills network-wide`);
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
          const vouchKind = opts.kind || 'endorse';
          const isWant = vouchKind === 'want';

          // Cap vouch — beacon required unless want-vouching (demand signal)
          const beaconSet = readBeaconSet();

          if (!isWant) {
            if (beaconSet.size === 0) {
              if (opts.json) {
                jsonError('no beacon set', "run 'vit init' first");
                return;
              }
              console.error(`no beacon set. run '${name} init' in a project directory first.`);
              process.exitCode = 1;
              return;
            }
            if (verbose) vlog(`[verbose] beacons: ${[...beaconSet].join(', ')}`);

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
          }

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
              if (!isWant && !beaconSet.has(rec.value.beacon)) continue;
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
              jsonError(`no cap found with ref '${ref}'${!isWant ? ' for this beacon' : ''}`);
              return;
            }
            console.error(`no cap found with ref '${ref}'${!isWant ? ' for this beacon' : ''}.`);
            console.error('');
            console.error('hint: caps only appear from accounts you follow and your own.');
            console.error(`  vit following          check who you're following`);
            console.error(`  vit explore cap ${ref}  search the network-wide index`);
            process.exitCode = 1;
            return;
          }

          const now = new Date().toISOString();
          const projBeacon = beaconSet.size > 0 ? [...beaconSet][0] : (match.value.beacon || null);
          const vouchRecord = {
            $type: VOUCH_COLLECTION,
            subject: {
              uri: match.uri,
              cid: match.cid,
            },
            createdAt: now,
            ref,
            kind: vouchKind,
          };
          if (projBeacon) vouchRecord.beacon = projBeacon;
          if (verbose) vlog(`[verbose] creating vouch (${vouchKind}) for ${match.uri}`);
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
              kind: vouchKind,
              beacon: projBeacon,
              ts: now,
            });
          } catch (logErr) {
            console.error('warning: failed to write vouched.jsonl:', logErr.message);
          }
          if (verbose) vlog('[verbose] logged to vouched.jsonl');

          if (opts.json) {
            jsonOk({ ref, uri: match.uri, vouchUri: res.data.uri, kind: vouchKind });
            return;
          }
          if (isWant) {
            console.log(`${mark} vouched (want): ${ref}`);
            console.log(`  demand signal recorded. vouch count visible in vit explore vouches.`);
          } else {
            console.log(`${mark} vouched: ${ref} (${match.uri})`);
          }
        }
      } catch (err) {
        if (opts.json) {
          jsonError(err);
          return;
        }
        console.error(formatError(err, { verbose: opts.verbose }));
        process.exitCode = 1;
      }
    });
}
