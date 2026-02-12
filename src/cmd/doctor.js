// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.js';

export default function register(program) {
  program
    .command('doctor')
    .description('Check vit setup status')
    .action(async () => {
      try {
        const config = loadConfig();
        if (config.setup_at) {
          const when = new Date(config.setup_at * 1000).toISOString();
          console.log(`setup: ok (${when})`);
        } else {
          console.log('setup: not done (run vit setup)');
        }

        const vitDir = join(process.cwd(), '.vit');
        if (existsSync(vitDir)) {
          console.log('.vit: found');
        } else {
          console.log('.vit: not found');
        }

        const beaconPath = join(vitDir, 'beacon');
        if (existsSync(beaconPath)) {
          const uri = readFileSync(beaconPath, 'utf-8').trim();
          console.log(`beacon: ${uri}`);
        } else {
          console.log('beacon: not set');
        }
      } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
      }
    });
}
