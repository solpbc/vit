// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { loadConfig } from '../lib/config.js';

export default function register(program) {
  program
    .command('plc-verify')
    .description('Verify PLC directory entry for saved Bluesky DID')
    .option('-v, --verbose', 'Show full API responses')
    .option('--did <did>', 'DID to check (overrides saved credentials)')
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const did = opts.did || config.did;

        if (!did) {
          throw new Error('No DID found. Run `vit login` first or pass --did <did>.');
        }

        if (!did.startsWith('did:plc:')) {
          throw new Error(`Expected a did:plc: identifier, got: ${did}`);
        }

        console.log(`Checking DID: ${did}\n`);

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

        const handles = doc.alsoKnownAs ?? [];
        const services = doc.service ?? [];
        const verificationMethods = doc.verificationMethod ?? [];

        console.log(`DID document:`);
        console.log(`  id: ${doc.id}`);
        console.log(`  handles: ${handles.join(', ') || '(none)'}`);
        console.log(`  services: ${services.map(s => `${s.id} (${s.type})`).join(', ') || '(none)'}`);
        console.log(`  verification methods: ${verificationMethods.length}`);
        console.log();

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
    });
}
