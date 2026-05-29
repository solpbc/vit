// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { ensureSkill } from './lib/skill-install.js';

try {
  const r = ensureSkill();
  if (r.ok) console.log('vit: using-vit skill installed');
} catch {
}

process.exit(0);
