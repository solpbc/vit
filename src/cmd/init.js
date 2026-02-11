// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default function register(program) {
  program
    .command('init')
    .description('Check for local .vit directory')
    .action(async () => {
      try {
        const vitDir = join(process.cwd(), '.vit');
        if (existsSync(vitDir)) {
          console.log('.vit directory found');
        } else {
          console.log('.vit directory not found');
        }
      } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
      }
    });
}
