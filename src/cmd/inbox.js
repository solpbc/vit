// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { DEFAULT_EXPLORE_URL } from '../lib/constants.js';
import { readBeaconSet } from '../lib/vit-dir.js';
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
  return `${days}d ago`;
}

function resolveUrl(opts) {
  return opts.exploreUrl || process.env.VIT_EXPLORE_URL || DEFAULT_EXPLORE_URL;
}

function unavailableMessage(baseUrl) {
  try {
    return `${new URL(baseUrl).host} is unavailable. try 'vit explore caps --beacon .' for network-wide discovery.`;
  } catch {
    return `${baseUrl} is unavailable. try 'vit explore caps --beacon .' for network-wide discovery.`;
  }
}

export default function register(program) {
  program
    .command('inbox')
    .description('Show caps addressed to your project beacon (project-centric view)')
    .option('--kind <kind>', 'Filter by cap kind (e.g. request)')
    .option('--sort <sort>', 'Sort order: recent (default) or want-vouches', 'recent')
    .option('--limit <n>', 'Limit number of caps')
    .option('--json', 'Output as JSON')
    .option('--explore-url <url>', 'Explore API base URL')
    .action(async (opts) => {
      try {
        const beaconSet = readBeaconSet();
        if (beaconSet.size === 0) {
          const msg = "no beacon set — run 'vit init' first (inbox requires a project beacon)";
          if (opts.json) {
            jsonError(msg);
            return;
          }
          console.error(msg);
          process.exitCode = 1;
          return;
        }

        const beacon = [...beaconSet].join(',');
        const baseUrl = resolveUrl(opts);

        let data;
        try {
          const url = new URL('/api/caps', baseUrl);
          url.searchParams.set('beacon', beacon);
          if (opts.kind) url.searchParams.set('kind', opts.kind);
          if (opts.sort === 'want-vouches') url.searchParams.set('sort', 'want-vouches');
          if (opts.limit) url.searchParams.set('limit', opts.limit);

          const res = await fetch(url);
          if (!res.ok) throw new Error(`explore API returned ${res.status}`);
          data = await res.json();
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
          console.error("fallback: try 'vit explore caps --beacon .' to query the explore index directly.");
          process.exitCode = 1;
          return;
        }

        if (opts.json) {
          jsonOk({ caps: data.caps || [], cursor: data.cursor || null });
          return;
        }

        const caps = data.caps || [];
        const beaconDisplay = [...beaconSet][0];

        console.log(`${brand} inbox — ${beaconDisplay}`);
        console.log('');

        if (caps.length === 0) {
          const kindFilter = opts.kind ? ` (kind: ${opts.kind})` : '';
          console.log(`no caps found${kindFilter}.`);
          if (opts.kind) {
            console.log(`hint: to request a feature, run 'vit ship --kind request --beacon <url>'`);
          }
          return;
        }

        for (const cap of caps) {
          const wantCount = cap.want_vouch_count ?? 0;
          const wantStr = wantCount === 1 ? '1 want' : `${wantCount} wants`;
          const age = cap.created_at ? timeAgo(cap.created_at) : '';
          const handle = cap.handle ? `@${cap.handle}` : cap.did || 'unknown';
          const kind = cap.kind || (cap.record_json ? (() => { try { return JSON.parse(cap.record_json).kind || ''; } catch { return ''; } })() : '');

          console.log(`  ${cap.ref}    ${handle}    ${wantStr}    ${age}`);
          if (cap.title) console.log(`  ${cap.title}${kind ? ` [${kind}]` : ''}`);
          if (cap.description) console.log(`  ${cap.description}`);
          console.log('');
        }

        const kindNote = opts.kind ? ` ${opts.kind}` : '';
        console.log(`${caps.length} open${kindNote} cap${caps.length === 1 ? '' : 's'}`);
        console.log(`tip: 'vit vouch <ref> --kind want' to signal demand`);
        console.log(`     'vit ship --recap <ref>' to ship an implementation`);
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
