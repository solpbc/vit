// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { DEFAULT_EXPLORE_URL } from '../lib/constants.js';
import { readProjectConfig } from '../lib/vit-dir.js';
import { brand } from '../lib/brand.js';
import { jsonOk, jsonError } from '../lib/json-output.js';

function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function resolveUrl(opts) {
  return opts.exploreUrl || process.env.VIT_EXPLORE_URL || DEFAULT_EXPLORE_URL;
}

function unavailableMessage(baseUrl) {
  try {
    return `${new URL(baseUrl).host} is unavailable. try 'vit scan' for network-wide discovery or 'vit skim' for your followed accounts.`;
  } catch {
    return `${baseUrl} is unavailable. try 'vit scan' for network-wide discovery or 'vit skim' for your followed accounts.`;
  }
}

async function runStats(opts) {
  const baseUrl = resolveUrl(opts);
  try {
    const url = new URL('/api/stats', baseUrl);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`explore API returned ${res.status}`);
    const data = await res.json();

    if (opts.json) {
      jsonOk(data);
      return;
    }

    console.log(`${brand} explore stats`);
    console.log(`  caps: ${data.total_caps}  skills: ${data.total_skills}`);
    console.log(`  vouches: ${data.total_vouches}  beacons: ${data.total_beacons}`);
    console.log(`  active dids: ${data.active_dids}  skill publishers: ${data.skill_publishers}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const finalMsg = msg.startsWith('explore API returned ')
      ? msg
      : unavailableMessage(baseUrl);
    if (opts.json) {
      jsonError(finalMsg);
      return;
    }
    console.error(finalMsg);
    process.exitCode = 1;
  }
}

export default function register(program) {
  const explore = program
    .command('explore')
    .description('Query the explore index for caps, skills, beacons, vouches, and stats');

  explore
    .command('caps')
    .description('List recent caps from the explore index')
    .option('--beacon <beacon>', 'Filter by beacon')
    .option('--limit <n>', 'Limit number of caps')
    .option('--cursor <id>', 'Pagination cursor')
    .option('--json', 'Output as JSON')
    .option('--explore-url <url>', 'Explore API base URL')
    .action(async (opts) => {
      const baseUrl = resolveUrl(opts);

      try {
        let beacon = opts.beacon;
        if (beacon === '.') {
          const config = readProjectConfig();
          const beacons = [config.beacon, config.secondaryBeacon].filter(Boolean);
          if (beacons.length === 0) {
            const msg = "no beacon set — run 'vit init' first";
            if (opts.json) {
              jsonError(msg);
              return;
            }
            console.error(msg);
            process.exitCode = 1;
            return;
          }
          beacon = beacons.join(',');
        }

        const url = new URL('/api/caps', baseUrl);
        if (beacon) url.searchParams.set('beacon', beacon);
        if (opts.limit) url.searchParams.set('limit', opts.limit);
        if (opts.cursor) url.searchParams.set('cursor', opts.cursor);

        const res = await fetch(url);
        if (!res.ok) throw new Error(`explore API returned ${res.status}`);
        const data = await res.json();

        if (opts.json) {
          jsonOk({ caps: data.caps, cursor: data.cursor });
          return;
        }

        console.log(`${brand} explore caps`);
        if (!data.caps?.length) {
          console.log('no caps found.');
          return;
        }

        for (const cap of data.caps) {
          console.log(`  ${cap.title} (${cap.ref})`);
          console.log(`    @${cap.handle}  ${cap.beacon}`);
          console.log(`    ${cap.description}`);
        }
        if (data.cursor) {
          console.log(`\nnext: --cursor ${data.cursor}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const finalMsg = msg.startsWith('explore API returned ')
          ? msg
          : unavailableMessage(baseUrl);
        if (opts.json) {
          jsonError(finalMsg);
          return;
        }
        console.error(finalMsg);
        process.exitCode = 1;
      }
    });

  explore
    .command('cap')
    .description('Show details for a single cap')
    .argument('<ref>', 'Cap ref slug')
    .option('--beacon <beacon>', 'Scope lookup to a specific beacon')
    .option('--json', 'Output as JSON')
    .option('--explore-url <url>', 'Explore API base URL')
    .action(async (ref, opts) => {
      const baseUrl = resolveUrl(opts);

      try {
        const url = new URL('/api/cap', baseUrl);
        url.searchParams.set('ref', ref);
        if (opts.beacon) url.searchParams.set('beacon', opts.beacon);

        const res = await fetch(url);
        if (!res.ok) throw new Error(`explore API returned ${res.status}`);
        const data = await res.json();

        if (!data.cap) {
          const msg = `no cap found with ref '${ref}'`;
          if (opts.json) {
            jsonError(msg);
            return;
          }
          console.error(msg);
          process.exitCode = 1;
          return;
        }

        if (opts.json) {
          jsonOk(data);
          return;
        }

        const cap = data.cap;
        let record = {};
        try { record = JSON.parse(cap.record_json); } catch {}

        console.log(`${brand} explore cap`);
        const kindTag = record.kind ? ` [${record.kind}]` : '';
        console.log(`  ${cap.title}${kindTag}`);
        console.log(`  ${cap.description}`);
        if (cap.beacon) console.log(`  beacon: ${cap.beacon}`);
        console.log(`  author: @${cap.handle}`);
        console.log(`  ref: ${cap.ref}`);
        console.log(`  shipped: ${timeAgo(cap.created_at)}`);
        if (record.text) {
          console.log('');
          console.log(`  ${record.text}`);
        }
        console.log('');
        console.log(`  vouches: ${cap.vouch_count}`);
        console.log('');
        console.log('  commands:');
        console.log(`    vit vouch ${cap.ref}`);
        console.log(`    vit vet ${cap.ref}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const finalMsg = msg.startsWith('explore API returned ')
          ? msg
          : unavailableMessage(baseUrl);
        if (opts.json) {
          jsonError(finalMsg);
          return;
        }
        console.error(finalMsg);
        process.exitCode = 1;
      }
    });

  explore
    .command('skills')
    .description('List published skills from the explore index')
    .option('--tag <tag>', 'Filter by tag')
    .option('--limit <n>', 'Limit number of skills')
    .option('--cursor <id>', 'Pagination cursor')
    .option('--json', 'Output as JSON')
    .option('--explore-url <url>', 'Explore API base URL')
    .action(async (opts) => {
      const baseUrl = resolveUrl(opts);

      try {
        const url = new URL('/api/skills', baseUrl);
        if (opts.tag) url.searchParams.set('tag', opts.tag);
        if (opts.limit) url.searchParams.set('limit', opts.limit);
        if (opts.cursor) url.searchParams.set('cursor', opts.cursor);

        const res = await fetch(url);
        if (!res.ok) throw new Error(`explore API returned ${res.status}`);
        const data = await res.json();

        if (opts.json) {
          jsonOk({ skills: data.skills, cursor: data.cursor });
          return;
        }

        console.log(`${brand} explore skills`);
        if (!data.skills?.length) {
          console.log('no skills found.');
          return;
        }

        for (const skill of data.skills) {
          console.log(`  ${skill.name} v${skill.version} (${skill.ref})`);
          console.log(`    @${skill.handle}  ${skill.description}`);
        }
        if (data.cursor) {
          console.log(`\nnext: --cursor ${data.cursor}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const finalMsg = msg.startsWith('explore API returned ')
          ? msg
          : unavailableMessage(baseUrl);
        if (opts.json) {
          jsonError(finalMsg);
          return;
        }
        console.error(finalMsg);
        process.exitCode = 1;
      }
    });

  explore
    .command('skill')
    .description('Show details for a single skill')
    .argument('<name>', 'Skill name')
    .option('--json', 'Output as JSON')
    .option('--explore-url <url>', 'Explore API base URL')
    .action(async (name, opts) => {
      const baseUrl = resolveUrl(opts);

      try {
        const url = new URL('/api/skill', baseUrl);
        url.searchParams.set('name', name);

        const res = await fetch(url);
        if (!res.ok) throw new Error(`explore API returned ${res.status}`);
        const data = await res.json();

        if (!data.skill) {
          const msg = `no skill found with name '${name}'`;
          if (opts.json) {
            jsonError(msg);
            return;
          }
          console.error(msg);
          process.exitCode = 1;
          return;
        }

        if (opts.json) {
          jsonOk(data);
          return;
        }

        const skill = data.skill;
        let record = {};
        try { record = JSON.parse(skill.record_json); } catch {}

        console.log(`${brand} explore skill`);
        console.log(`  ${skill.name} v${skill.version}`);
        console.log(`  ${skill.description}`);
        console.log(`  author: @${skill.handle}`);
        if (record.license) console.log(`  license: ${record.license}`);
        if (skill.tags) console.log(`  tags: ${skill.tags}`);
        console.log('');
        console.log(`  vouches: ${skill.vouch_count}`);
        console.log('');
        console.log('  commands:');
        console.log(`    vit learn skill-${skill.name}`);
        console.log(`    vit adopt <beacon> skill-${skill.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const finalMsg = msg.startsWith('explore API returned ')
          ? msg
          : unavailableMessage(baseUrl);
        if (opts.json) {
          jsonError(finalMsg);
          return;
        }
        console.error(finalMsg);
        process.exitCode = 1;
      }
    });

  explore
    .command('beacons')
    .description('List active beacons from the explore index')
    .option('--json', 'Output as JSON')
    .option('--explore-url <url>', 'Explore API base URL')
    .action(async (opts) => {
      const baseUrl = resolveUrl(opts);

      try {
        const url = new URL('/api/beacons', baseUrl);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`explore API returned ${res.status}`);
        const data = await res.json();

        if (opts.json) {
          jsonOk({ beacons: data.beacons });
          return;
        }

        console.log(`${brand} explore beacons`);
        if (!data.beacons?.length) {
          console.log('no beacons found.');
          return;
        }

        for (const beacon of data.beacons) {
          console.log(`  ${beacon.name}`);
          console.log(`    caps: ${beacon.cap_count}  vouches: ${beacon.vouch_count}  last active: ${beacon.last_activity}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const finalMsg = msg.startsWith('explore API returned ')
          ? msg
          : unavailableMessage(baseUrl);
        if (opts.json) {
          jsonError(finalMsg);
          return;
        }
        console.error(finalMsg);
        process.exitCode = 1;
      }
    });

  explore
    .command('vouches')
    .description('List vouches for a cap from the explore index')
    .option('--cap <uri>', 'Cap URI')
    .option('--ref <ref>', 'Cap ref')
    .option('--beacon <beacon>', 'Filter ref lookup by beacon')
    .option('--json', 'Output as JSON')
    .option('--explore-url <url>', 'Explore API base URL')
    .action(async (opts) => {
      const baseUrl = resolveUrl(opts);

      try {
        if ((!opts.cap && !opts.ref) || (opts.cap && opts.ref)) {
          const msg = 'provide --cap <uri> or --ref <ref>';
          if (opts.json) {
            jsonError(msg);
            return;
          }
          console.error(msg);
          process.exitCode = 1;
          return;
        }

        let capUri = opts.cap;
        if (opts.ref) {
          const capsUrl = new URL('/api/caps', baseUrl);
          if (opts.beacon) capsUrl.searchParams.set('beacon', opts.beacon);

          const capsRes = await fetch(capsUrl);
          if (!capsRes.ok) throw new Error(`explore API returned ${capsRes.status}`);
          const capsData = await capsRes.json();
          const match = capsData.caps?.find((cap) => cap.ref === opts.ref);

          if (!match) {
            const msg = `no cap found with ref '${opts.ref}'`;
            if (opts.json) {
              jsonError(msg);
              return;
            }
            console.error(msg);
            process.exitCode = 1;
            return;
          }

          capUri = match.uri;
        }

        const url = new URL('/api/vouches', baseUrl);
        url.searchParams.set('cap_uri', capUri);

        const res = await fetch(url);
        if (!res.ok) throw new Error(`explore API returned ${res.status}`);
        const data = await res.json();

        if (opts.json) {
          jsonOk({ vouches: data.vouches, cap_uri: capUri });
          return;
        }

        console.log(`${brand} explore vouches`);
        if (!data.vouches?.length) {
          console.log('no vouches found for this cap.');
          return;
        }

        for (const vouch of data.vouches) {
          const who = vouch.handle ? `@${vouch.handle}` : (vouch.did || 'unknown');
          const createdAt = vouch.created_at || vouch.createdAt || 'unknown';
          const ref = vouch.ref || vouch.cap_ref || vouch.cap_uri || '';
          console.log(`  ${who}  ${createdAt}`);
          if (ref) console.log(`    ${ref}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const finalMsg = msg.startsWith('explore API returned ')
          ? msg
          : unavailableMessage(baseUrl);
        if (opts.json) {
          jsonError(finalMsg);
          return;
        }
        console.error(finalMsg);
        process.exitCode = 1;
      }
    });

  explore
    .command('stats', { isDefault: true })
    .description('Show network-wide stats from the explore index')
    .option('--json', 'Output as JSON')
    .option('--explore-url <url>', 'Explore API base URL')
    .action(async (opts) => runStats(opts));
}
