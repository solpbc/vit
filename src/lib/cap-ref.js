// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { sha256 } from '@noble/hashes/sha256';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export const REF_PATTERN = /^[a-z]+-[a-z]+-[a-z]+$/;

export function hashTo3Words(input) {
  const hash = sha256(new TextEncoder().encode(input));
  // Take first 33 bits -> 3 x 11-bit indices into BIP39 wordlist (2048 words)
  const i0 = (hash[0] << 3) | (hash[1] >> 5);
  const i1 = ((hash[1] & 0x1f) << 6) | (hash[2] >> 2);
  const i2 = ((hash[2] & 0x03) << 9) | (hash[3] << 1) | (hash[4] >> 7);
  return `${wordlist[i0]}-${wordlist[i1]}-${wordlist[i2]}`;
}

export function resolveRef(record, cid) {
  if (record?.ref && REF_PATTERN.test(record.ref)) {
    return record.ref;
  }
  return hashTo3Words(cid);
}
