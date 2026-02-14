// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

const AGENTS = new Set(['claude', 'codex', 'gemini']);

export function sandboxArgs(agent, { prompt, systemPrompt, model } = {}) {
  if (!AGENTS.has(agent)) {
    throw new Error(`Unknown agent: ${agent}. Must be one of: ${[...AGENTS].join(', ')}`);
  }
  if (!prompt) {
    throw new Error('prompt is required');
  }

  if (agent === 'claude') {
    const args = ['-p', '--tools', '', '--output-format', 'json'];
    if (systemPrompt) args.push('--system-prompt', systemPrompt);
    args.push('--model', model || 'haiku');
    args.push(prompt);
    return { cmd: 'claude', args, env: { CLAUDECODE: '' } };
  }

  // codex and gemini lack a separate system prompt flag,
  // so we prepend instructions to the prompt
  const combined = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  if (agent === 'codex') {
    const args = ['exec', '-s', 'read-only'];
    if (model) args.push('-m', model);
    args.push(combined);
    return { cmd: 'codex', args, env: {} };
  }

  // gemini
  const args = ['-p', combined, '-s', '-e', 'none', '--output-format', 'json'];
  if (model) args.push('-m', model);
  return { cmd: 'gemini', args, env: {} };
}
