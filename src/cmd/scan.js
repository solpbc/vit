// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { CAP_COLLECTION, SKILL_COLLECTION, JETSTREAM_URL } from '../lib/constants.js';
import { resolveRef } from '../lib/cap-ref.js';
import { resolveHandleFromDid } from '../lib/pds.js';
import { brand } from '../lib/brand.js';

export default function register(program) {
  program
    .command('scan')
    .description('Discover cap and skill publishers across the network via Jetstream replay')
    .option('--days <n>', 'Number of days to replay', '7')
    .option('--beacon <beacon>', 'Filter by beacon (caps only)')
    .option('--skills', 'Show only skill publishers')
    .option('--caps', 'Show only cap publishers')
    .option('--tag <tag>', 'Filter skills by tag')
    .option('-v, --verbose', 'Show each event as it arrives')
    .option('--jetstream <url>', 'Jetstream WebSocket URL (default: VIT_JETSTREAM_URL env or built-in)')
    .action(async (opts) => {
      try {
        const days = parseInt(opts.days, 10);
        if (isNaN(days) || days < 1) {
          console.error('error: --days must be a positive integer');
          process.exitCode = 1;
          return;
        }

        const wantCaps = !opts.skills;
        const wantSkills = !opts.caps;

        const cursor = (Date.now() - days * 86400000) * 1000;
        const timeout = Math.max(120000, Math.min(600000, days * 60000));

        // Build wanted collections
        const collections = [];
        if (wantCaps) collections.push(CAP_COLLECTION);
        if (wantSkills) collections.push(SKILL_COLLECTION);

        const jetstreamUrl = opts.jetstream || JETSTREAM_URL;
        const url = new URL(jetstreamUrl);
        for (const col of collections) {
          url.searchParams.append('wantedCollections', col);
        }
        url.searchParams.set('cursor', String(cursor));

        const scanType = wantCaps && wantSkills ? 'cap + skill' : wantSkills ? 'skill' : 'cap';
        console.log(`${brand} scan`);
        console.log(`  Replaying ${days} day${days === 1 ? '' : 's'} of ${scanType} events...`);
        if (opts.beacon) console.log(`  Beacon filter: ${opts.beacon}`);
        if (opts.tag) console.log(`  Tag filter: ${opts.tag}`);
        console.log(`  Timeout: ${Math.round(timeout / 1000)}s`);
        console.log('');

        const publishers = new Map();

        await new Promise((resolve, reject) => {
          const ws = new WebSocket(url.toString());
          const timer = setTimeout(() => {
            ws.close();
            resolve();
          }, timeout);

          ws.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch { return; }

            if (msg.kind !== 'commit' || msg.commit?.operation !== 'create') return;

            const record = msg.commit?.record;
            if (!record) return;

            const collection = msg.commit?.collection;
            const isCapEvent = collection === CAP_COLLECTION;
            const isSkillEvent = collection === SKILL_COLLECTION;

            if (!isCapEvent && !isSkillEvent) return;

            // Apply filters
            if (isCapEvent && opts.beacon && record.beacon !== opts.beacon) return;
            if (isSkillEvent && opts.tag) {
              const tags = record.tags || [];
              if (!tags.some(t => t.toLowerCase() === opts.tag.toLowerCase())) return;
            }

            const did = msg.did;
            const ref = isCapEvent && msg.commit?.cid ? resolveRef(record, msg.commit.cid) : null;

            if (opts.verbose) {
              const didShort = did.slice(-12);
              if (isCapEvent) {
                const title = record.title || '';
                const refPart = ref ? ` (${ref})` : '';
                console.log(`  ${didShort}: [cap] ${title}${refPart} [${record.beacon || 'no beacon'}]`);
              } else {
                const skillName = record.name || '';
                const tags = record.tags ? ` [${record.tags.join(', ')}]` : '';
                console.log(`  ${didShort}: [skill] ${skillName}${tags}`);
              }
            }

            if (!publishers.has(did)) {
              publishers.set(did, { capCount: 0, skillCount: 0, beacons: new Set(), tags: new Set(), lastActive: '' });
            }
            const entry = publishers.get(did);
            if (isCapEvent) {
              entry.capCount++;
              if (record.beacon) entry.beacons.add(record.beacon);
            } else {
              entry.skillCount++;
              if (record.tags) {
                for (const t of record.tags) entry.tags.add(t);
              }
            }
            if (record.createdAt && record.createdAt > entry.lastActive) {
              entry.lastActive = record.createdAt;
            }
          };

          ws.onerror = (err) => {
            clearTimeout(timer);
            reject(new Error(`WebSocket error: ${err?.message ?? 'unknown'}`));
          };

          ws.onclose = () => {
            clearTimeout(timer);
            resolve();
          };
        });

        if (publishers.size === 0) {
          console.log(`no ${scanType} publishers found in this time window.`);
          return;
        }

        const entries = [];
        for (const [did, stats] of publishers) {
          const handle = await resolveHandleFromDid(did);
          entries.push({ handle, did, ...stats, beacons: [...stats.beacons], tags: [...stats.tags] });
        }

        const totalCount = (e) => e.capCount + e.skillCount;
        entries.sort((a, b) => totalCount(b) - totalCount(a));

        console.log(`found ${entries.length} publisher${entries.length === 1 ? '' : 's'}:\n`);
        for (const e of entries) {
          console.log(`  @${e.handle}`);
          const parts = [];
          if (wantCaps && e.capCount > 0) {
            const beaconStr = e.beacons.length > 0 ? e.beacons.join(', ') : '(none)';
            parts.push(`caps: ${e.capCount}  beacons: ${beaconStr}`);
          }
          if (wantSkills && e.skillCount > 0) {
            const tagStr = e.tags.length > 0 ? e.tags.join(', ') : '(none)';
            parts.push(`skills: ${e.skillCount}  tags: ${tagStr}`);
          }
          const lastActive = e.lastActive ? e.lastActive.split('T')[0] : 'unknown';
          parts.push(`last active: ${lastActive}`);
          console.log(`    ${parts.join('  ')}`);
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
