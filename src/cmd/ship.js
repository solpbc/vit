// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { TID } from '@atproto/common-web';
import { readFileSync } from 'node:fs';
import { CAP_COLLECTION } from '../lib/constants.js';
import { requireAgent } from '../lib/agent.js';
import { requireDid } from '../lib/config.js';
import { restoreAgent } from '../lib/oauth.js';
import { appendLog, readProjectConfig, readLog, readFollowing } from '../lib/vit-dir.js';
import { REF_PATTERN, resolveRef } from '../lib/cap-ref.js';
import { name } from '../lib/brand.js';
import { resolvePds, listRecordsFromPds } from '../lib/pds.js';

export default function register(program) {
  program
    .command('ship')
    .description('Publish a cap to your feed')
    .option('-v, --verbose', 'Show step-by-step details')
    .option('--did <did>', 'DID to use (reads saved DID from config if not provided)')
    .requiredOption('--title <title>', 'Short title for the cap')
    .requiredOption('--description <description>', 'Description of the cap')
    .requiredOption('--ref <ref>', 'Three lowercase words with dashes (e.g. fast-cache-invalidation)')
    .option('--recap <ref>', 'Ref of the cap this derives from (quote-post semantics)')
    .action(async (opts) => {
      try {
        const gate = requireAgent();
        if (!gate.ok) {
          console.error(`${name} ship should be run by a coding agent (e.g. claude code, gemini cli).`);
          console.error(`open your agent and ask it to run '${name} ship' for you.`);
          console.error(`refer to the using-vit skill (skills/vit/SKILL.md) for a shipping guide.`);
          process.exitCode = 1;
          return;
        }

        const { verbose } = opts;

        // preflight: DID
        const did = requireDid(opts);
        if (!did) return;
        if (verbose) console.log(`[verbose] DID: ${did}`);

        // preflight: beacon
        const projectConfig = readProjectConfig();
        if (!projectConfig.beacon) {
          console.error(`no beacon set. run '${name} init' in a project directory first.`);
          process.exitCode = 1;
          return;
        }
        if (verbose) console.log(`[verbose] beacon: ${projectConfig.beacon}`);

        let text;
        try {
          text = readFileSync('/dev/stdin', 'utf-8').trim();
        } catch {
          text = '';
        }
        if (!text) {
          console.error('error: cap body is required via stdin (pipe or heredoc)');
          process.exitCode = 1;
          return;
        }

        if (!REF_PATTERN.test(opts.ref)) {
          console.error('error: --ref must be exactly three lowercase words separated by dashes (e.g. fast-cache-invalidation)');
          process.exitCode = 1;
          return;
        }

        let recapUri = null;
        if (opts.recap) {
          if (!REF_PATTERN.test(opts.recap)) {
            console.error('error: --recap must be exactly three lowercase words separated by dashes (e.g. fast-cache-invalidation)');
            process.exitCode = 1;
            return;
          }

          const caps = readLog('caps.jsonl');
          const localMatch = caps.find(e => e.ref === opts.recap);
          if (localMatch) {
            recapUri = localMatch.uri;
            if (verbose) console.log(`[verbose] recap resolved locally: ${recapUri}`);
          }
        }

        const now = new Date().toISOString();

        // preflight: session
        let agent, session;
        try {
          ({ agent, session } = await restoreAgent(did));
        } catch {
          console.error(`session expired or invalid. tell your user to run '${name} login <handle>'.`);
          process.exitCode = 1;
          return;
        }
        if (verbose) console.log(`[verbose] Session restored, PDS: ${session.serverMetadata?.issuer}`);

        if (opts.recap && !recapUri) {
          const following = readFollowing();
          const dids = following.map(e => e.did);
          dids.push(did);
          if (verbose) console.log(`[verbose] recap: querying ${dids.length} accounts`);

          let match = null;
          for (const repoDid of dids) {
            try {
              const pds = await resolvePds(repoDid);
              if (verbose) console.log(`[verbose] ${repoDid}: resolved PDS ${pds}`);
              const res = await listRecordsFromPds(pds, repoDid, CAP_COLLECTION, 50);
              for (const rec of res.records) {
                const recRef = resolveRef(rec.value, rec.cid);
                if (recRef === opts.recap) {
                  if (!match || (rec.value.createdAt || '') > (match.value.createdAt || '')) {
                    match = rec;
                  }
                }
              }
            } catch (err) {
              if (verbose) console.log(`[verbose] ${repoDid}: error fetching caps: ${err.message}`);
            }
          }

          if (match) {
            recapUri = match.uri;
            if (verbose) console.log(`[verbose] recap resolved remotely: ${recapUri}`);
          } else {
            console.error(`error: could not find cap with ref '${opts.recap}' to recap`);
            process.exitCode = 1;
            return;
          }
        }

        const record = {
          $type: CAP_COLLECTION,
          text,
          title: opts.title,
          description: opts.description,
          ref: opts.ref,
          createdAt: now,
        };
        if (projectConfig.beacon) record.beacon = projectConfig.beacon;
        if (opts.recap) record.recap = { uri: recapUri, ref: opts.recap };
        const rkey = TID.nextStr();
        if (verbose) console.log(`[verbose] Record built, rkey: ${rkey}`);
        const putArgs = {
          repo: did,
          collection: CAP_COLLECTION,
          rkey,
          record,
          validate: false,
        };
        if (verbose) console.log(`[verbose] putRecord ${putArgs.collection} rkey=${rkey}`);
        const putRes = await agent.com.atproto.repo.putRecord(putArgs);
        try {
          appendLog('caps.jsonl', {
            ts: now,
            did,
            rkey,
            ref: opts.ref,
            collection: CAP_COLLECTION,
            pds: session.serverMetadata?.issuer,
            uri: putRes.data.uri,
            cid: putRes.data.cid,
          });
        } catch (logErr) {
          console.error('warning: failed to write caps.jsonl:', logErr.message);
        }
        if (verbose) console.log(`[verbose] Log written to caps.jsonl`);
        console.log(`shipped: ${opts.ref}`);
        console.log(`uri: ${putRes.data.uri}`);
        if (verbose) {
          console.log(
            JSON.stringify({
              ts: now,
              pds: session.serverMetadata?.issuer,
              xrpc: 'com.atproto.repo.putRecord',
              request: putArgs,
              response: putRes.data,
            }),
          );
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    })
    .addHelpText('after', `
Authoring guidance (for coding agents):

  Refer to the using-vit skill (skills/vit/SKILL.md) for a complete shipping guide.

  Fields:
    --title          Short name for the cap (2-5 words)
    --description    One sentence explaining what this cap does
    --ref            Three lowercase words with dashes (your-ref-name)
    --recap <ref>    Optional. Ref of the cap this derives from (links back to original)
    body (stdin)     Full cap content, piped or via heredoc

  Example:
    vit ship --title "Fast LRU Cache" \\
             --description "Thread-safe LRU cache with O(1) eviction" \\
             --ref "fast-lru-cache" \\
             <<'EOF'
    ... full cap body text ...
    EOF`);
}
