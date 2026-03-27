// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { requireDid } from '../lib/config.js';
import { CAP_COLLECTION, SKILL_COLLECTION } from '../lib/constants.js';
import { restoreAgent } from '../lib/oauth.js';
import { readProjectConfig, readFollowing } from '../lib/vit-dir.js';
import { requireAgent } from '../lib/agent.js';
import { resolveRef } from '../lib/cap-ref.js';
import { skillRefFromName } from '../lib/skill-ref.js';
import { name } from '../lib/brand.js';
import { resolvePds, listRecordsFromPds, queryDidsInParallel } from '../lib/pds.js';

export default function register(program) {
  program
    .command('skim')
    .description('Read caps and skills from followed accounts')
    .option('--did <did>', 'DID to use')
    .option('--handle <handle>', 'Show items from a specific handle only')
    .option('--limit <n>', 'Max items to display', '25')
    .option('--json', 'Output as JSON array')
    .option('--caps', 'Show only caps')
    .option('--skills', 'Show only skills')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (opts) => {
      try {
        const gate = requireAgent();
        if (!gate.ok) {
          console.error(`${name} skim should be run by a coding agent (e.g. claude code, gemini cli).`);
          console.error(`open your agent and ask it to run '${name} skim' for you.`);
          process.exitCode = 1;
          return;
        }

        const { verbose } = opts;
        const did = requireDid(opts);
        if (!did) return;
        if (verbose) console.log(`[verbose] DID: ${did}`);

        const projectConfig = readProjectConfig();
        const beacon = projectConfig.beacon;

        const wantCaps = !opts.skills;
        const wantSkills = !opts.caps;
        const skillsOnly = opts.skills && !opts.caps;

        // Beacon required unless --skills only mode
        if (!beacon && !skillsOnly) {
          console.error(`no beacon set. run '${name} init' in a project directory first.`);
          process.exitCode = 1;
          return;
        }

        if (verbose && beacon) console.log(`[verbose] beacon: ${beacon}`);

        const { agent } = await restoreAgent(did);
        if (verbose) console.log('[verbose] session restored');

        // build list of DIDs to query and DID→handle map
        const handleMap = new Map();
        let dids;
        if (opts.handle) {
          const handle = opts.handle.replace(/^@/, '');
          const resolved = await agent.resolveHandle({ handle });
          dids = [resolved.data.did];
          handleMap.set(resolved.data.did, handle);
          if (verbose) console.log(`[verbose] resolved ${handle} to ${resolved.data.did}`);
        } else {
          const following = readFollowing();
          for (const e of following) handleMap.set(e.did, e.handle);
          dids = following.map(e => e.did);
          dids.push(did);
          if (verbose) console.log(`[verbose] querying ${dids.length} accounts (${dids.length - 1} follows + self)`);
        }

        // resolve own handle if not already known
        if (!handleMap.has(did)) {
          try {
            const desc = await agent.com.atproto.repo.describeRepo({ repo: did });
            handleMap.set(did, desc.data.handle);
          } catch {
            if (verbose) console.log(`[verbose] could not resolve handle for ${did}`);
          }
        }

        // fetch from each DID
        const allItems = [];

        await queryDidsInParallel(dids, async (repoDid) => {
          const pds = await resolvePds(repoDid);
          if (verbose) console.log(`[verbose] ${repoDid}: resolved PDS ${pds}`);

          if (wantCaps && beacon) {
            const res = await listRecordsFromPds(pds, repoDid, CAP_COLLECTION);
            const caps = res.records.filter(r => r.value.beacon === beacon);
            if (verbose) console.log(`[verbose] ${repoDid}: ${res.records.length} caps, ${caps.length} matching beacon`);
            for (const cap of caps) {
              cap._handle = handleMap.get(repoDid) || repoDid;
              cap._type = 'cap';
            }
            allItems.push(...caps);
          }

          if (wantSkills) {
            try {
              const res = await listRecordsFromPds(pds, repoDid, SKILL_COLLECTION);
              if (verbose) console.log(`[verbose] ${repoDid}: ${res.records.length} skills`);
              for (const skill of res.records) {
                skill._handle = handleMap.get(repoDid) || repoDid;
                skill._type = 'skill';
              }
              allItems.push(...res.records);
            } catch (err) {
              if (verbose) console.log(`[verbose] ${repoDid}: error fetching skills: ${err.message}`);
            }
          }
        });

        // sort by createdAt descending
        allItems.sort((a, b) => {
          const ta = a.value.createdAt || '';
          const tb = b.value.createdAt || '';
          return tb.localeCompare(ta);
        });

        // apply limit
        const limit = parseInt(opts.limit, 10);
        const capped = allItems.slice(0, limit);

        if (opts.json) {
          console.log(JSON.stringify(capped, null, 2));
        } else {
          if (capped.length === 0) {
            if (skillsOnly) {
              console.log('no skills found.');
            } else if (opts.caps) {
              console.log('no caps found for this beacon.');
            } else {
              console.log('no caps or skills found.');
            }
          }
          for (const rec of capped) {
            if (rec._type === 'skill') {
              const skillRef = skillRefFromName(rec.value.name);
              const skillName = rec.value.name || '';
              const description = rec.value.description || '';
              const version = rec.value.version;
              const tags = rec.value.tags;
              console.log(`ref: ${skillRef}`);
              console.log(`by: @${rec._handle}`);
              console.log(`type: skill${version ? '  v' + version : ''}`);
              if (skillName) console.log(`title: ${skillName}`);
              if (description) console.log(`description: ${description}`);
              if (tags && tags.length > 0) console.log(`tags: ${tags.join(', ')}`);
              console.log();
            } else {
              const ref = resolveRef(rec.value, rec.cid);
              const title = rec.value.title || '';
              const description = rec.value.description || '';
              console.log(`ref: ${ref}`);
              console.log(`by: @${rec._handle}`);
              console.log(`type: cap`);
              if (title) console.log(`title: ${title}`);
              if (description) console.log(`description: ${description}`);
              console.log();
            }
          }
          console.log('---');
          console.log(`hint: tell your user to run '${name} vet <ref>' in another terminal for any item they want to review.`);
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
