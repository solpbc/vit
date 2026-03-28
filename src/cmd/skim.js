// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { requireDid } from '../lib/config.js';
import { CAP_COLLECTION, SKILL_COLLECTION } from '../lib/constants.js';
import { restoreAgent } from '../lib/oauth.js';
import { readBeaconSet, readFollowing } from '../lib/vit-dir.js';
import { requireAgent } from '../lib/agent.js';
import { resolveRef } from '../lib/cap-ref.js';
import { skillRefFromName } from '../lib/skill-ref.js';
import { name } from '../lib/brand.js';
import { resolvePds, listRecordsFromPds, batchQuery } from '../lib/pds.js';

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

        const beaconSet = readBeaconSet();

        const wantCaps = !opts.skills;
        const wantSkills = !opts.caps;
        const skillsOnly = opts.skills && !opts.caps;

        // Beacon required unless --skills only mode
        if (beaconSet.size === 0 && !skillsOnly) {
          console.error(`no beacon set. run '${name} init' in a project directory first.`);
          process.exitCode = 1;
          return;
        }

        if (verbose && beaconSet.size > 0) console.log(`[verbose] beacons: ${[...beaconSet].join(', ')}`);

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

        const batchResults = await batchQuery(dids, async (repoDid) => {
          const pds = await resolvePds(repoDid);
          if (verbose) console.log(`[verbose] ${repoDid}: resolved PDS ${pds}`);
          const items = [];

          // Fetch caps (filtered by beacon)
          if (wantCaps && beaconSet.size > 0) {
            const res = await listRecordsFromPds(pds, repoDid, CAP_COLLECTION, 50);
            const caps = res.records.filter(r => beaconSet.has(r.value.beacon));
            if (verbose) console.log(`[verbose] ${repoDid}: ${res.records.length} caps, ${caps.length} matching beacon`);
            for (const cap of caps) {
              cap._handle = handleMap.get(repoDid) || repoDid;
              cap._type = 'cap';
            }
            items.push(...caps);
          }

          // Fetch skills (unfiltered — skills are universal)
          if (wantSkills) {
            try {
              const res = await listRecordsFromPds(pds, repoDid, SKILL_COLLECTION, 50);
              if (verbose) console.log(`[verbose] ${repoDid}: ${res.records.length} skills`);
              for (const skill of res.records) {
                skill._handle = handleMap.get(repoDid) || repoDid;
                skill._type = 'skill';
              }
              items.push(...res.records);
            } catch (err) {
              if (verbose) console.log(`[verbose] ${repoDid}: error fetching skills: ${err.message}`);
            }
          }

          return items;
        }, { verbose });

        for (const items of batchResults) {
          allItems.push(...items);
        }

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
          if (capped.length === 0) {
            const following = readFollowing();
            let hint;
            if (skillsOnly) {
              hint = "no skills found — try 'vit explore skills' or ship your own with 'vit ship --skill'";
            } else if (following.length === 0) {
              hint = "not following anyone — run 'vit follow <handle>'";
            } else {
              hint = "no matching caps — try 'vit explore caps' or 'vit ship'";
            }
            console.log(JSON.stringify({ ok: true, items: [], hint }, null, 2));
          } else {
            console.log(JSON.stringify(capped, null, 2));
          }
        } else {
          if (capped.length === 0) {
            if (skillsOnly) {
              console.log('no skills found from followed accounts.');
              console.log('');
              console.log("try 'vit explore skills' to discover skills network-wide, or ship your own with 'vit ship --skill'.");
            } else {
              const following = readFollowing();
              if (following.length === 0) {
                console.log("no caps or skills found. you're not following anyone yet and haven't shipped any caps for this beacon.");
                console.log('');
                console.log('next steps:');
                console.log('  vit scan              discover active publishers on the network');
                console.log('  vit follow <handle>   start following someone to see their caps');
                console.log('  vit ship              publish a cap to seed the network');
              } else {
                console.log('no caps found for this beacon from your followed accounts.');
                console.log('');
                console.log("the network grows when people ship. publish a cap with 'vit ship' to get things started for this project.");
                console.log("try 'vit explore caps' for network-wide discovery.");
              }
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
          if (capped.length > 0) {
            console.log('---');
            console.log(`hint: tell your operator to run '${name} vet <ref>' in another terminal for any item they want to review.`);
          }
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
