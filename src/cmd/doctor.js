// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { loadConfig } from '../lib/config.js';
import { readProjectConfig } from '../lib/vit-dir.js';

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

        const projConfig = readProjectConfig();
        if (projConfig.beacon) {
          console.log(`beacon: ${projConfig.beacon}`);
        } else {
          console.log('beacon: not set');
        }
      } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
      }
    });
}
