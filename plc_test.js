#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { readFileSync } from 'node:fs';
import { Command } from 'commander';

function loadEnv() {
  const envPath = new URL('.env', import.meta.url).pathname;
  const vars = {};
  let content;
  try {
    content = readFileSync(envPath, 'utf-8');
  } catch {
    return vars;
  }
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
    if (m) vars[m[1]] = m[2];
  }
  return vars;
}

async function main() {
  const program = new Command();

  program
    .name('plc_test')
    .description('Verify PLC directory entry for saved Bluesky DID')
    .option('-v, --verbose', 'Show full API responses')
    .option('--did <did>', 'DID to check (overrides .env)')
    .parse();

  const opts = program.opts();

  try {
    const env = loadEnv();
    const did = opts.did || env.BSKY_DID;

    if (!did) {
      throw new Error('No DID found. Run bsky_oauth.js first or pass --did <did>.');
    }

    if (!did.startsWith('did:plc:')) {
      throw new Error(`Expected a did:plc: identifier, got: ${did}`);
    }

    console.log(`Checking DID: ${did}\n`);

    // Resolve DID document
    const docUrl = `https://plc.directory/${did}`;
    const docRes = await fetch(docUrl);
    if (!docRes.ok) {
      throw new Error(`PLC directory returned ${docRes.status} for ${docUrl}`);
    }
    const doc = await docRes.json();

    if (opts.verbose) {
      console.log('[verbose] DID document:');
      console.log(JSON.stringify(doc, null, 2));
      console.log();
    }

    // Validate expected fields
    const handles = doc.alsoKnownAs ?? [];
    const services = doc.service ?? [];
    const verificationMethods = doc.verificationMethod ?? [];

    console.log(`DID document:`);
    console.log(`  id: ${doc.id}`);
    console.log(`  handles: ${handles.join(', ') || '(none)'}`);
    console.log(`  services: ${services.map(s => `${s.id} (${s.type})`).join(', ') || '(none)'}`);
    console.log(`  verification methods: ${verificationMethods.length}`);
    console.log();

    // Fetch audit log
    const auditUrl = `https://plc.directory/${did}/log/audit`;
    const auditRes = await fetch(auditUrl);
    if (!auditRes.ok) {
      throw new Error(`PLC directory returned ${auditRes.status} for ${auditUrl}`);
    }
    const auditLog = await auditRes.json();

    if (opts.verbose) {
      console.log('[verbose] Audit log:');
      console.log(JSON.stringify(auditLog, null, 2));
      console.log();
    }

    console.log(`Audit log: ${auditLog.length} operation(s)`);
    if (auditLog.length > 0) {
      const first = auditLog[0];
      const last = auditLog[auditLog.length - 1];
      console.log(`  first: ${first.createdAt}`);
      if (auditLog.length > 1) {
        console.log(`  latest: ${last.createdAt}`);
      }
    }
    console.log();

    console.log('All checks passed.');
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

await main();
