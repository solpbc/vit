// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('shipCap traverses the shared cap publisher', () => {
  const source = readFileSync(join(import.meta.dir, '..', 'src', 'cmd', 'ship.js'), 'utf-8');
  const shipCapStart = source.indexOf('export async function shipCap');
  const shipCapEnd = source.indexOf('export default function register');
  const shipCapBody = source.slice(shipCapStart, shipCapEnd);

  expect(source).toContain("import { publishCap } from '../lib/cap.js';");
  expect(shipCapStart).toBeGreaterThan(-1);
  expect(shipCapEnd).toBeGreaterThan(shipCapStart);
  expect(shipCapBody).toContain('publishCap(');
  expect(source.match(/putRecord\(/g) || []).toHaveLength(1);
});
