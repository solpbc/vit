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
    .description('Probe a remote repo for a .vit/beacon file')
    .argument('<target>', 'vit: URI or git URL to probe')
    .action(async (target) => {
      try {
        const url = beaconToHttps(target);
        const { fs } = memfs();
        const dir = '/';

        await git.clone({ fs, http, dir, url, depth: 1, singleBranch: true, noCheckout: true });

        const head = await git.resolveRef({ fs, dir, ref: 'HEAD' });
        const commit = await git.readObject({ fs, dir, oid: head, format: 'parsed' });
        const content = await readTreeFile(fs, dir, commit.object.tree, ['.vit', 'beacon']);

        if (content && content.trim()) {
          console.log('beacon: lit ' + content.trim());
        } else {
          console.log('beacon: unlit');
        }
      } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
      }
    });
}
