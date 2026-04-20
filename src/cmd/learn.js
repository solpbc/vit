// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { requireDid } from '../lib/config.js';
import { SKILL_COLLECTION } from '../lib/constants.js';
import { restoreAgent } from '../lib/oauth.js';
import { readFollowing, readLog, appendLog, vitDir } from '../lib/vit-dir.js';
import { requireAgent, detectCodingAgent } from '../lib/agent.js';
import { shouldBypassVet } from '../lib/trust-gate.js';
import { isSkillRef, nameFromSkillRef, isValidSkillRef, isValidSkillName } from '../lib/skill-ref.js';
import { mark, name } from '../lib/brand.js';
import { resolvePds, resolveHandle, listRecordsFromPds, batchQuery } from '../lib/pds.js';
import { loadConfig } from '../lib/config.js';
import { jsonOk, jsonError } from '../lib/json-output.js';
import { errorMessage, formatError } from '../lib/error-format.js';

async function installSkill({ match, skillName, isGlobal, opts, ref }) {
  const { verbose } = opts;
  const vlog = opts.json ? (...a) => console.error(...a) : console.log;
  const record = match.value;

  const tempDir = mkdtempSync(join(tmpdir(), 'vit-learn-'));
  try {
    writeFileSync(join(tempDir, 'SKILL.md'), record.text);
    if (verbose) vlog('[verbose] wrote SKILL.md to temp dir');

    if (record.resources && record.resources.length > 0) {
      const authorDid = match.uri.split('/')[2];
      const pds = await resolvePds(authorDid);

      for (const resource of record.resources) {
        const resourcePath = join(tempDir, resource.path);
        mkdirSync(dirname(resourcePath), { recursive: true });

        try {
          const blobCid = resource.blob?.ref?.$link || resource.blob?.cid;
          if (blobCid) {
            const blobUrl = new URL('/xrpc/com.atproto.sync.getBlob', pds);
            blobUrl.searchParams.set('did', authorDid);
            blobUrl.searchParams.set('cid', blobCid);
            const blobRes = await fetch(blobUrl);
            if (!blobRes.ok) throw new Error(`blob fetch failed: ${blobRes.status}`);
            const blobData = Buffer.from(await blobRes.arrayBuffer());
            writeFileSync(resourcePath, blobData);
            if (verbose) vlog(`[verbose] wrote resource: ${resource.path}`);
          }
        } catch (err) {
          console.error(`warning: failed to download resource ${resource.path}: ${err.message}`);
        }
      }
    }

    const addArgs = ['skills', 'add', tempDir, '-a', 'claude-code', '-y'];
    if (isGlobal) addArgs.push('-g');
    const addResult = spawnSync('npx', addArgs, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (addResult.status !== 0) {
      const errText = (addResult.stderr || addResult.stdout || '').trim();
      throw new Error(`skill install failed: ${errText || 'unknown error'}`);
    }
    if (verbose) vlog('[verbose] installed via npx skills add');
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`warning: failed to remove temporary directory ${tempDir}: ${errorMessage(err)}`);
    }
  }

  const installDir = isGlobal
    ? join(homedir(), '.claude', 'skills', skillName)
    : join(process.cwd(), '.claude', 'skills', skillName);

  if (existsSync(vitDir())) {
    try {
      appendLog('learned.jsonl', {
        ref,
        name: skillName,
        uri: match.uri,
        cid: match.cid,
        installedTo: installDir,
        scope: isGlobal ? 'user' : 'project',
        learnedAt: new Date().toISOString(),
        version: record.version || null,
      });
    } catch (logErr) {
      console.error('warning: failed to write learned.jsonl:', logErr.message);
    }
  }

  const scope = isGlobal ? 'user' : 'project';
  if (opts.json) {
    jsonOk({ ref, name: skillName, installedTo: installDir, scope, version: record.version || null });
    return;
  }
  console.log(`${mark} learned: ${ref} (${scope})`);
  console.log(`installed to: ${installDir}`);
  if (record.version) console.log(`version: ${record.version}`);
}

async function learnFromHandle(ref, opts) {
  const { verbose } = opts;
  const vlog = opts.json ? (...a) => console.error(...a) : console.log;

  let raw = ref.slice(1);
  let projectLocal = false;
  if (raw.endsWith('.')) {
    projectLocal = true;
    raw = raw.slice(0, -1);
  }

  const slashIdx = raw.indexOf('/');
  if (slashIdx === -1 || slashIdx === 0 || slashIdx === raw.length - 1) {
    if (opts.json) {
      jsonError('invalid ref', 'expected format: @handle/skill-name');
      return;
    }
    console.error('invalid ref. expected format: @handle/skill-name');
    process.exitCode = 1;
    return;
  }

  const handle = raw.slice(0, slashIdx);
  const skillName = raw.slice(slashIdx + 1);

  if (!handle.includes('.')) {
    if (opts.json) {
      jsonError('invalid handle', 'handle must be a domain name (e.g. alice.bsky.social)');
      return;
    }
    console.error('invalid handle. must be a domain name (e.g. alice.bsky.social)');
    process.exitCode = 1;
    return;
  }

  if (!isValidSkillName(skillName)) {
    if (opts.json) {
      jsonError('invalid skill name', 'lowercase letters, numbers, hyphens only');
      return;
    }
    console.error('invalid skill name. lowercase letters, numbers, hyphens only.');
    console.error('no leading hyphen, no consecutive hyphens, max 64 chars.');
    process.exitCode = 1;
    return;
  }

  if (verbose) vlog(`[verbose] handle: ${handle}, skill: ${skillName}`);

  const did = await resolveHandle(handle);
  if (verbose) vlog(`[verbose] resolved DID: ${did}`);

  const pds = await resolvePds(did);
  if (verbose) vlog(`[verbose] resolved PDS: ${pds}`);

  const { records } = await listRecordsFromPds(pds, did, SKILL_COLLECTION, 50);

  let match = null;
  for (const rec of records) {
    if (rec.value.name === skillName) {
      if (!match || (rec.value.createdAt || '') > (match.value.createdAt || '')) {
        match = rec;
      }
    }
  }

  if (!match) {
    const msg = `no skill '${skillName}' found from @${handle}`;
    if (opts.json) {
      jsonError(msg);
      return;
    }
    console.error(msg);
    process.exitCode = 1;
    return;
  }

  if (verbose) vlog(`[verbose] found skill: ${match.value.name} from ${match.uri}`);

  if (opts.dryRun) {
    const record = match.value;
    if (opts.json) {
      jsonOk({
        name: record.name,
        author: handle,
        did,
        description: record.description || null,
        version: record.version || null,
        tags: record.tags || [],
        resources: (record.resources || []).map(r => r.path),
        text: record.text,
      });
      return;
    }
    console.log(`name: ${record.name}`);
    console.log(`author: @${handle} (${did})`);
    if (record.description) console.log(`description: ${record.description}`);
    if (record.version) console.log(`version: ${record.version}`);
    if (record.tags?.length) console.log(`tags: ${record.tags.join(', ')}`);
    if (record.resources?.length) console.log(`resources: ${record.resources.map(r => r.path).join(', ')}`);
    console.log('');
    console.log('--- SKILL.md ---');
    console.log(record.text);
    return;
  }

  const isGlobal = !(projectLocal || opts.project);
  await installSkill({ match, skillName, isGlobal, opts, ref });
}

export default function register(program) {
  program
    .command('learn')
    .argument('<ref>', 'Skill reference: @handle/name or skill-{name}')
    .description('Install a skill from the network')
    .option('--did <did>', 'DID to use (skill-{name} path only)')
    .option('--user', 'Install to user-wide ~/.claude/skills/ (skill-{name} path, requires vet)')
    .option('--project', 'Install to project .claude/skills/ (@handle/ path)')
    .option('--dry-run', 'Show skill contents without installing')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Show step-by-step details')
    .addHelpText('after', `
Examples:
  vit learn @solpbc.org/using-vit          Install from publisher (user-wide)
  vit learn @solpbc.org/using-vit.         Install from publisher (project-local)
  vit learn @solpbc.org/using-vit --project  Same as trailing dot
  vit learn @solpbc.org/using-vit --dry-run  Inspect without installing
  vit learn skill-agent-test-patterns      Install from followed accounts (project-local)
  vit learn skill-agent-test-patterns --user Install from followed (user-wide, requires vet)
`)
    .action(async (ref, opts) => {
      try {
        if (ref.startsWith('@')) {
          await learnFromHandle(ref, opts);
          return;
        }

        const gate = requireAgent();
        if (!gate.ok) {
          if (opts.json) {
            jsonError('agent required', 'run vit learn from a coding agent');
            return;
          }
          console.error(`${name} learn should be run by a coding agent (e.g. claude code, gemini cli).`);
          console.error(`open your agent and ask it to run '${name} learn' for you.`);
          process.exitCode = 1;
          return;
        }

        const { verbose } = opts;
        const vlog = opts.json ? (...a) => console.error(...a) : console.log;

        if (!isSkillRef(ref)) {
          if (opts.json) {
            jsonError('invalid skill ref', 'expected format: skill-{name}');
            return;
          }
          console.error(`invalid skill ref. expected format: skill-{name} (e.g. skill-agent-test-patterns)`);
          process.exitCode = 1;
          return;
        }

        if (!isValidSkillRef(ref)) {
          if (opts.json) {
            jsonError('invalid skill ref', 'lowercase letters, numbers, hyphens only');
            return;
          }
          console.error('invalid skill ref. name must be lowercase letters, numbers, hyphens only.');
          console.error('no leading hyphen, no consecutive hyphens, max 64 chars.');
          process.exitCode = 1;
          return;
        }

        const skillName = nameFromSkillRef(ref);
        if (verbose) vlog(`[verbose] skill name: ${skillName}`);

        // Trust gate
        const isUserInstall = !!opts.user;
        const trusted = readLog('trusted.jsonl');
        const trustedEntry = trusted.find(e => e.ref === ref);

        if (isUserInstall && !trustedEntry) {
          // --user ALWAYS requires vet
          if (opts.json) {
            jsonError(`skill '${ref}' is not yet vetted`, 'user-wide install requires vetting');
            return;
          }
          console.error(`skill '${ref}' is not yet vetted. user-wide install requires vetting.`);
          console.error(`tell your operator to vet it first:`);
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
          // Project-level: requires vet UNLESS dangerous-accept
          const trustGate = shouldBypassVet();
          if (!trustGate.bypass) {
            if (opts.json) {
              jsonError(`skill '${ref}' is not yet vetted`, `run 'vit vet ${ref}' first`);
              return;
            }
            console.error(`skill '${ref}' is not yet vetted.`);
            console.error(`tell your operator to vet it first:`);
            console.error('');
            console.error(`  vit vet ${ref}`);
            console.error('');
            console.error('after reviewing, they can trust it with:');
            console.error('');
            console.error(`  vit vet ${ref} --trust`);
            if (detectCodingAgent()) {
              console.error('');
              console.error('or, to trust all items without review:');
              console.error('');
              console.error('  vit vet --dangerous-accept --confirm');
            }
            process.exitCode = 1;
            return;
          }
          if (verbose) vlog(`[verbose] vet gate bypassed: ${trustGate.reason}`);
        }

        if (opts.json && !(opts.did || loadConfig().did)) {
          jsonError('no DID configured', "run 'vit login <handle>' first");
          return;
        }
        const did = requireDid(opts);
        if (!did) return;
        if (verbose) vlog(`[verbose] DID: ${did}`);

        const { agent } = await restoreAgent(did);
        if (verbose) vlog('[verbose] session restored');

        // Build DID list from following + self
        const following = readFollowing();
        const dids = following.map(e => e.did);
        dids.push(did);

        // Fetch skills from each DID, find matching ref
        const allRecords = await batchQuery(dids, async (repoDid) => {
          const pds = await resolvePds(repoDid);
          if (verbose) vlog(`[verbose] ${repoDid}: resolved PDS ${pds}`);
          return (await listRecordsFromPds(pds, repoDid, SKILL_COLLECTION, 50)).records;
        }, { verbose });

        let match = null;
        for (const records of allRecords) {
          for (const rec of records) {
            const recName = rec.value.name;
            if (recName === skillName) {
              if (!match || (rec.value.createdAt || '') > (match.value.createdAt || '')) {
                match = rec;
              }
            }
          }
        }

        if (!match) {
          if (opts.json) {
            jsonError(`no skill found with ref '${ref}'`);
            return;
          }
          console.error(`no skill found with ref '${ref}' from followed accounts.`);
          console.error('');
          console.error('hint: skills appear from accounts you follow and your own.');
          console.error(`  vit following             check who you're following`);
          console.error(`  vit explore skills        browse skills network-wide`);
          process.exitCode = 1;
          return;
        }

        const record = match.value;
        if (verbose) vlog(`[verbose] found skill: ${record.name} from ${match.uri}`);

        if (opts.dryRun) {
          if (opts.json) {
            jsonOk({
              name: record.name,
              author: match.uri.split('/')[2],
              description: record.description || null,
              version: record.version || null,
              tags: record.tags || [],
              resources: (record.resources || []).map(r => r.path),
              text: record.text,
            });
            return;
          }
          console.log(`name: ${record.name}`);
          console.log(`author: ${match.uri.split('/')[2]}`);
          if (record.description) console.log(`description: ${record.description}`);
          if (record.version) console.log(`version: ${record.version}`);
          if (record.tags?.length) console.log(`tags: ${record.tags.join(', ')}`);
          if (record.resources?.length) console.log(`resources: ${record.resources.map(r => r.path).join(', ')}`);
          console.log('');
          console.log('--- SKILL.md ---');
          console.log(record.text);
          return;
        }

        await installSkill({ match, skillName, isGlobal: !!opts.user, opts, ref });
      } catch (err) {
        if (opts.json) {
          jsonError(err);
          return;
        }
        console.error(formatError(err, { verbose: opts.verbose }));
        process.exitCode = 1;
      }
    });
}
