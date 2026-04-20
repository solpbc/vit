// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { existsSync, mkdirSync, symlinkSync, unlinkSync, readlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mark, name } from '../lib/brand.js';
import { formatError } from '../lib/error-format.js';

export default function register(program) {
  program
    .command('link')
    .description('Link vit binary into ~/.local/bin (or create .cmd shim on Windows)')
    .action(async () => {
      try {
        const vitBin = resolve(import.meta.dirname, '..', '..', 'bin', 'vit.js');
        if (!existsSync(vitBin)) {
          console.error(`${name} link could not find ${vitBin}`);
          process.exitCode = 1;
          return;
        }

        let binDir;
        if (process.platform === 'win32') {
          const home = process.env.USERPROFILE || process.env.HOME;
          binDir = join(home, '.local', 'bin');
          mkdirSync(binDir, { recursive: true });
          const target = join(binDir, 'vit.cmd');
          writeFileSync(target, `@node "${vitBin}" %*\n`);
          console.log(`${mark} link: ${target} -> ${vitBin}`);
        } else {
          binDir = join(process.env.HOME, '.local', 'bin');
          mkdirSync(binDir, { recursive: true });
          const target = join(binDir, 'vit');
          if (existsSync(target)) {
            try {
              const current = readlinkSync(target);
              if (current === vitBin) {
                console.log(`${mark} link: already linked`);
              } else {
                unlinkSync(target);
                symlinkSync(vitBin, target);
                console.log(`${mark} link: ${target} -> ${vitBin}`);
              }
            } catch {
              unlinkSync(target);
              symlinkSync(vitBin, target);
              console.log(`${mark} link: ${target} -> ${vitBin}`);
            }
          } else {
            symlinkSync(vitBin, target);
            console.log(`${mark} link: ${target} -> ${vitBin}`);
          }
        }

        const pathDirs = (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':');
        if (!pathDirs.includes(binDir)) {
          const shell = (process.env.SHELL || '').split('/').pop();
          let instruction = '[Environment]::SetEnvironmentVariable("PATH", "$env:USERPROFILE\\.local\\bin;" + $env:PATH, "User")';
          if (shell === 'fish') {
            instruction = 'set -Ua fish_user_paths ~/.local/bin';
          } else if (shell === 'zsh') {
            instruction = 'echo \'export PATH="$HOME/.local/bin:$PATH"\' >> ~/.zshrc';
          } else if (shell === 'bash') {
            instruction = 'echo \'export PATH="$HOME/.local/bin:$PATH"\' >> ~/.bashrc';
          }
          console.log(`${mark} note: add ~/.local/bin to your PATH:`);
          console.log(instruction);
        } else {
          console.log(`${mark} PATH: ok`);
        }
      } catch (err) {
        console.error(formatError(err, { verbose: false }));
        process.exitCode = 1;
      }
    });
}
