// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { which } from '../lib/compat.js';
import { mark, name } from '../lib/brand.js';

export default function register(program) {
  program
    .command('hack')
    .description('Fork and install vit from source')
    .option('--from <repo>', 'Clone an existing fork instead of creating a new one (e.g. user/vit)')
    .action(async (opts) => {
      try {
        const ghPath = which('gh');
        if (!opts.from && !ghPath) {
          console.error(`${name} hack requires gh (GitHub CLI). Install it from https://cli.github.com`);
          process.exitCode = 1;
          return;
        }

        const gitPath = which('git');
        if (opts.from && !gitPath) {
          console.error('missing required tool: git');
          process.exitCode = 1;
          return;
        }

        const repo = opts.from || 'solpbc/vit';
        const dirName = repo.split('/').pop();
        const dirPath = resolve(process.cwd(), dirName);
        const cloned = !existsSync(dirPath);

        if (!cloned) {
          console.log(`${mark} ${dirName}/ already exists, skipping clone`);
        } else if (opts.from) {
          execFileSync('git', ['clone', 'https://github.com/' + opts.from + '.git', dirName], { stdio: 'inherit' });
        } else {
          execFileSync('gh', ['repo', 'fork', 'solpbc/vit', '--clone'], { stdio: 'inherit' });
        }

        process.chdir(dirName);

        const bunPath = which('bun');
        if (!bunPath) {
          console.error('missing required tool: bun');
          process.exitCode = 1;
          return;
        }

        execFileSync('bun', ['install'], { stdio: 'inherit' });
        execFileSync('node', [join(process.cwd(), 'bin', 'vit.js'), 'link'], { stdio: 'inherit' });

        if (!opts.from) {
          const remote = execFileSync(
            'gh',
            ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
            { encoding: 'utf-8' }
          ).trim();
          const hackPath = join(process.cwd(), 'hack');
          if (existsSync(hackPath)) {
            const current = readFileSync(hackPath, 'utf-8');
            writeFileSync(hackPath, current.replace('SELF="solpbc/vit"', `SELF="${remote}"`));
          }
        }

        if (opts.from && cloned) {
          try {
            execFileSync('git', ['remote', 'add', 'upstream', 'https://github.com/solpbc/vit.git'], { stdio: 'inherit' });
          } catch {}
        }

        console.log('');
        console.log(`${mark} ${name} installed from source`);
        console.log(`run: cd ${dirName}`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
