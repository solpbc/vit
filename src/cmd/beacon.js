// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { memfs } from 'memfs';
import { beaconToHttps } from '../lib/beacon.js';

async function readTreeFile(fs, dir, treeOid, pathParts) {
  for (let i = 0; i < pathParts.length; i++) {
    const entries = (await git.readObject({ fs, dir, oid: treeOid, format: 'parsed' })).object;
    const entry = entries.find(e => e.path === pathParts[i]);
    if (!entry) return null;
    if (i === pathParts.length - 1) {
      const blob = await git.readObject({ fs, dir, oid: entry.oid, format: 'content' });
      return new TextDecoder().decode(blob.object);
    }
    treeOid = entry.oid;
  }
  return null;
}

export default function register(program) {
  program
    .command('beacon')
    .description('Probe a remote repo for its beacon')
    .argument('<target>', 'vit: URI or git URL to probe')
    .option('-v, --verbose', 'Show step-by-step details')
    .action(async (target, opts) => {
      try {
        const { verbose } = opts;
        const url = beaconToHttps(target);
        if (verbose) console.log(`[verbose] Resolved URL: ${url}`);
        const { fs } = memfs();
        const dir = '/';

        if (verbose) console.log(`[verbose] Cloning (depth=1)...`);
        await git.clone({ fs, http, dir, url, depth: 1, singleBranch: true, noCheckout: true });

        const head = await git.resolveRef({ fs, dir, ref: 'HEAD' });
        if (verbose) console.log(`[verbose] HEAD resolved: ${head}`);
        const commit = await git.readObject({ fs, dir, oid: head, format: 'parsed' });
        const content = await readTreeFile(fs, dir, commit.object.tree, ['.vit', 'config.json']);
        if (verbose) console.log(`[verbose] Read .vit/config.json: ${content ? 'found' : 'not found'}`);

        let beacon;
        try {
          beacon = content && JSON.parse(content).beacon;
        } catch {}

        if (beacon) {
          console.log('beacon: lit ' + beacon);
        } else {
          console.log('beacon: unlit');
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
