// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

const CODING_AGENTS = {
  CLAUDECODE: 'claude code',
  GEMINI_CLI: 'gemini cli',
  CODEX_CI: 'codex',
};

export function detectCodingAgent() {
  for (const [envVar, name] of Object.entries(CODING_AGENTS)) {
    if (process.env[envVar] === '1') return { name, envVar };
  }
  return null;
}

export function requireAgent() {
  const agent = detectCodingAgent();
  if (agent) return { ok: true, ...agent };
  return { ok: false };
}

export function requireNotAgent() {
  const agent = detectCodingAgent();
  if (!agent) return { ok: true };
  return { ok: false, ...agent };
}
