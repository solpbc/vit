// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { loadConfig } from '../lib/config.js';
import { restoreAgent } from '../lib/oauth.js';
import { readProjectConfig } from '../lib/vit-dir.js';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mark, name } from '../lib/brand.js';
import { which } from '../lib/compat.js';

function scanSkillDir(dir) {
  const skills = [];
  if (!existsSync(dir)) return skills;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMd = join(dir, entry.name, 'SKILL.md');
      if (existsSync(skillMd)) {
        let version = null;
        try {
          const content = readFileSync(skillMd, 'utf-8');
          const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          if (match) {
            const versionMatch = match[1].match(/^version:\s*(.+)$/m);
            if (versionMatch) version = versionMatch[1].trim();
          }
        } catch { /* ignore read errors */ }
        skills.push({ name: entry.name, version });
      }
    }
  } catch { /* ignore dir read errors */ }
  return skills;
}

export default function register(program) {
  async function checkHealth() {
    try {
      const config = loadConfig();
      if (config.setup_at) {
        const when = new Date(config.setup_at * 1000).toISOString();
        console.log(`${mark} setup: ok (${when})`);
      } else {
        console.log(`${mark} setup: not done (run ${name} setup)`);
      }

      const vitPath = which(name);
      if (!vitPath) {
        console.log(`${mark} install: not on PATH`);
      } else {
        try {
          if (lstatSync(vitPath).isSymbolicLink()) {
            console.log(`${mark} install: linked (${vitPath})`);
          } else if (vitPath.includes('node_modules')) {
            console.log(`${mark} install: global`);
          } else {
            console.log(`${mark} install: source (${vitPath})`);
          }
        } catch {
          console.log(`${mark} install: source (${vitPath})`);
        }
      }

      const projConfig = readProjectConfig();
      if (projConfig.beacon) {
        console.log(`${mark} beacon: ${projConfig.beacon}`);
      } else {
        console.log(`${mark} beacon: not set`);
      }

      const skillPath = join(process.cwd(), '.claude', 'skills', 'using-vit', 'SKILL.md');
      if (existsSync(skillPath)) {
        console.log(`${mark} skill: ok (using-vit)`);
      } else {
        console.log(`${mark} skill: not installed (run ${name} setup)`);
      }

      // Report installed skills
      const projectSkillDir = join(process.cwd(), '.claude', 'skills');
      const projectSkills = scanSkillDir(projectSkillDir);
      const userSkillDir = join(homedir(), '.claude', 'skills');
      const userSkills = scanSkillDir(userSkillDir);

      if (projectSkills.length > 0) {
        console.log(`${mark} project skills: ${projectSkills.length} installed`);
        for (const s of projectSkills) {
          const ver = s.version ? ` v${s.version}` : '';
          console.log(`    ${s.name}${ver}`);
        }
      }
      if (userSkills.length > 0) {
        console.log(`${mark} user skills: ${userSkills.length} installed`);
        for (const s of userSkills) {
          const ver = s.version ? ` v${s.version}` : '';
          console.log(`    ${s.name}${ver}`);
        }
      }

      if (!config.did) {
        console.log(`${mark} bluesky: not logged in (run ${name} login <handle>)`);
      } else {
        try {
          const { session } = await restoreAgent(config.did);
          const pds = session.serverMetadata?.issuer;
          console.log(`${mark} bluesky: ok (${session.did}${pds ? ', ' + pds : ''})`);
        } catch {
          console.log(`${mark} bluesky: token expired or invalid (run ${name} login <handle>)`);
        }
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  }

  program.command('doctor')
    .description('Verify vit environment and project configuration')
    .action(checkHealth);
  program.command('status')
    .description('Alias for doctor')
    .action(checkHealth);
}
