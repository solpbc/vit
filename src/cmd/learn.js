// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { requireDid } from '../lib/config.js';
import { SKILL_COLLECTION } from '../lib/constants.js';
import { restoreAgent } from '../lib/oauth.js';
import { readFollowing, readLog, appendLog } from '../lib/vit-dir.js';
import { requireAgent } from '../lib/agent.js';
import { isSkillRef, nameFromSkillRef, isValidSkillRef } from '../lib/skill-ref.js';
import { mark, name } from '../lib/brand.js';
import { resolvePds, listRecordsFromPds } from '../lib/pds.js';

export default function register(program) {
  program
    .command('learn')
    .argument('<ref>', 'Skill reference (e.g. skill-agent-test-patterns)')
    .description('Install a skill from the network into your skill directory')
    .option('--did <did>', 'DID to use')
    .option('--user', 'Install to user-wide ~/.claude/skills/ (requires vet)')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (ref, opts) => {
      try {
        const gate = requireAgent();
        if (!gate.ok) {
          console.error(`${name} learn should be run by a coding agent (e.g. claude code, gemini cli).`);
          console.error(`open your agent and ask it to run '${name} learn' for you.`);
          process.exitCode = 1;
          return;
        }

        const { verbose } = opts;

        if (!isSkillRef(ref)) {
          console.error(`invalid skill ref. expected format: skill-{name} (e.g. skill-agent-test-patterns)`);
          process.exitCode = 1;
          return;
        }

        if (!isValidSkillRef(ref)) {
          console.error('invalid skill ref. name must be lowercase letters, numbers, hyphens only.');
          console.error('no leading hyphen, no consecutive hyphens, max 64 chars.');
          process.exitCode = 1;
          return;
        }

        const skillName = nameFromSkillRef(ref);
        if (verbose) console.log(`[verbose] skill name: ${skillName}`);

        // Trust gate
        const isUserInstall = !!opts.user;
        const trusted = readLog('trusted.jsonl');
        const trustedEntry = trusted.find(e => e.ref === ref);

        if (isUserInstall && !trustedEntry) {
          // --user ALWAYS requires vet
          console.error(`skill '${ref}' is not yet vetted. user-wide install requires vetting.`);
          console.error(`ask the user to vet it first:`);
          console.error('');
          console.error(`  vit vet ${ref}`);
          console.error('');
          console.error('after reviewing, they can trust it with:');
          console.error('');
          console.error(`  vit vet ${ref} --trust`);
          process.exitCode = 1;
          return;
        }

        if (!isUserInstall && !trustedEntry) {
          // Project-level: requires vet UNLESS skip-perms
          // Check if running in skip-perms mode (dangerously-skip-permissions)
          const skipPerms = process.env.CLAUDE_SKIP_PERMISSIONS === '1' ||
                           process.argv.includes('--dangerously-skip-permissions');
          if (!skipPerms) {
            console.error(`skill '${ref}' is not yet vetted.`);
            console.error(`ask the user to vet it first:`);
            console.error('');
            console.error(`  vit vet ${ref}`);
            console.error('');
            console.error('after reviewing, they can trust it with:');
            console.error('');
            console.error(`  vit vet ${ref} --trust`);
            process.exitCode = 1;
            return;
          }
          if (verbose) console.log('[verbose] skip-perms mode: bypassing vet for project-level install');
        }

        const did = requireDid(opts);
        if (!did) return;
        if (verbose) console.log(`[verbose] DID: ${did}`);

        const { agent } = await restoreAgent(did);
        if (verbose) console.log('[verbose] session restored');

        // Build DID list from following + self
        const following = readFollowing();
        const dids = following.map(e => e.did);
        dids.push(did);
        if (verbose) console.log(`[verbose] querying ${dids.length} accounts`);

        // Fetch skills from each DID, find matching ref
        let match = null;
        for (const repoDid of dids) {
          try {
            const pds = await resolvePds(repoDid);
            if (verbose) console.log(`[verbose] ${repoDid}: resolved PDS ${pds}`);
            const res = await listRecordsFromPds(pds, repoDid, SKILL_COLLECTION, 50);
            for (const rec of res.records) {
              const recName = rec.value.name;
              if (recName === skillName) {
                if (!match || (rec.value.createdAt || '') > (match.value.createdAt || '')) {
                  match = rec;
                }
              }
            }
          } catch (err) {
            if (verbose) console.log(`[verbose] ${repoDid}: error fetching skills: ${err.message}`);
          }
        }

        if (!match) {
          console.error(`no skill found with ref '${ref}' from followed accounts.`);
          process.exitCode = 1;
          return;
        }

        const record = match.value;
        if (verbose) console.log(`[verbose] found skill: ${record.name} from ${match.uri}`);

        // Determine install path
        let installDir;
        if (isUserInstall) {
          installDir = join(homedir(), '.claude', 'skills', skillName);
        } else {
          installDir = join(process.cwd(), '.claude', 'skills', skillName);
        }

        mkdirSync(installDir, { recursive: true });

        // Write SKILL.md from text field — verbatim, no reconstruction
        writeFileSync(join(installDir, 'SKILL.md'), record.text);
        if (verbose) console.log(`[verbose] wrote SKILL.md to ${installDir}`);

        // Download and write resource blobs
        if (record.resources && record.resources.length > 0) {
          const authorDid = match.uri.split('/')[2];
          const pds = await resolvePds(authorDid);

          for (const resource of record.resources) {
            const resourcePath = join(installDir, resource.path);
            mkdirSync(dirname(resourcePath), { recursive: true });

            try {
              // Download blob from PDS
              const blobCid = resource.blob?.ref?.$link || resource.blob?.cid;
              if (blobCid) {
                const blobUrl = new URL('/xrpc/com.atproto.sync.getBlob', pds);
                blobUrl.searchParams.set('did', authorDid);
                blobUrl.searchParams.set('cid', blobCid);
                const blobRes = await fetch(blobUrl);
                if (!blobRes.ok) throw new Error(`blob fetch failed: ${blobRes.status}`);
                const blobData = Buffer.from(await blobRes.arrayBuffer());
                writeFileSync(resourcePath, blobData);
                if (verbose) console.log(`[verbose] wrote resource: ${resource.path}`);
              }
            } catch (err) {
              console.error(`warning: failed to download resource ${resource.path}: ${err.message}`);
            }
          }
        }

        // Log to learned.jsonl
        try {
          appendLog('learned.jsonl', {
            ref,
            name: skillName,
            uri: match.uri,
            cid: match.cid,
            installedTo: installDir,
            scope: isUserInstall ? 'user' : 'project',
            learnedAt: new Date().toISOString(),
            version: record.version || null,
          });
        } catch (logErr) {
          console.error('warning: failed to write learned.jsonl:', logErr.message);
        }

        const scope = isUserInstall ? 'user' : 'project';
        console.log(`${mark} learned: ${ref} (${scope})`);
        console.log(`installed to: ${installDir}`);
        if (record.version) console.log(`version: ${record.version}`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
