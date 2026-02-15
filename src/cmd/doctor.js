// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { loadConfig } from '../lib/config.js';
import { readProjectConfig } from '../lib/vit-dir.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default function register(program) {
  program
    .command('doctor')
    .description('Verify vit environment and project configuration')
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

        const skillPath = join(process.cwd(), '.claude', 'skills', 'using-vit', 'SKILL.md');
        if (existsSync(skillPath)) {
          console.log('skill: ok (using-vit)');
        } else {
          console.log('skill: not installed (run vit setup)');
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
