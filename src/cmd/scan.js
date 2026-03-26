// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { CAP_COLLECTION } from '../lib/constants.js';
import { resolveRef } from '../lib/cap-ref.js';
import { resolveHandleFromDid } from '../lib/pds.js';
import { brand } from '../lib/brand.js';

const JETSTREAM_URL = 'wss://jetstream2.us-east.bsky.network/subscribe';

export default function register(program) {
  program
    .command('scan')
    .description('Discover cap publishers across the network via Jetstream replay')
    .option('--days <n>', 'Number of days to replay', '7')
    .option('--beacon <beacon>', 'Filter by beacon')
    .option('-v, --verbose', 'Show each event as it arrives')
    .action(async (opts) => {
      try {
        const days = parseInt(opts.days, 10);
        if (isNaN(days) || days < 1) {
          console.error('error: --days must be a positive integer');
          process.exitCode = 1;
          return;
        }

        const cursor = (Date.now() - days * 86400000) * 1000;
        const timeout = Math.max(120000, Math.min(600000, days * 60000));

        const url = new URL(JETSTREAM_URL);
        url.searchParams.set('wantedCollections', CAP_COLLECTION);
        url.searchParams.set('cursor', String(cursor));

        console.log(`${brand} scan`);
        console.log(`  Replaying ${days} day${days === 1 ? '' : 's'} of cap events...`);
        if (opts.beacon) console.log(`  Beacon filter: ${opts.beacon}`);
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

            if (opts.beacon && record.beacon !== opts.beacon) return;

            const did = msg.did;
            const ref = msg.commit?.cid ? resolveRef(record, msg.commit.cid) : null;

            if (opts.verbose) {
              const didShort = did.slice(-12);
              const title = record.title || '';
              const refPart = ref ? ` (${ref})` : '';
              console.log(`  ${didShort}: ${title}${refPart} [${record.beacon || 'no beacon'}]`);
            }

            if (!publishers.has(did)) {
              publishers.set(did, { count: 0, beacons: new Set(), lastActive: '' });
            }
            const entry = publishers.get(did);
            entry.count++;
            if (record.beacon) entry.beacons.add(record.beacon);
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
          console.log('no cap publishers found in this time window.');
          return;
        }

        const entries = [];
        for (const [did, stats] of publishers) {
          const handle = await resolveHandleFromDid(did);
          entries.push({ handle, did, ...stats, beacons: [...stats.beacons] });
        }

        entries.sort((a, b) => b.count - a.count);

        console.log(`found ${entries.length} publisher${entries.length === 1 ? '' : 's'}:\n`);
        for (const e of entries) {
          const beaconStr = e.beacons.length > 0 ? e.beacons.join(', ') : '(none)';
          const lastActive = e.lastActive ? e.lastActive.split('T')[0] : 'unknown';
          console.log(`  @${e.handle}`);
          console.log(`    caps: ${e.count}  beacons: ${beaconStr}  last active: ${lastActive}`);
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
