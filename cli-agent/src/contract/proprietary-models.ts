/**
 * Native cloud models for proprietary CLIs (Cursor / Codex / Claude Code).
 * Selected on the executor node — not from shared llm-config (ollama/gigachat).
 */

export const PROPRIETARY_AGENT_SLUGS = [
  'claude-code',
  'codex',
  'cursor',
] as const;

export type ProprietaryAgentSlug = (typeof PROPRIETARY_AGENT_SLUGS)[number];

/** Claude Code `--model` aliases + common pinned ids. */
export const CLAUDE_CODE_MODELS = [
  'sonnet',
  'opus',
  'haiku',
  'fable',
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'claude-haiku-4-5',
  'claude-sonnet-5-5',
  'claude-opus-5-5',
] as const;

export type ClaudeCodeModel = (typeof CLAUDE_CODE_MODELS)[number];

/** Codex CLI `-m` / `--model` picker ids. */
export const CODEX_MODELS = [
  'gpt-6.1-sol',
  'gpt-6-astra',
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'o3',
  'o4-mini',
] as const;

export type CodexModel = (typeof CODEX_MODELS)[number];

/** Cursor Agent CLI `--model` ids. */
export const CURSOR_MODELS = [
  'auto',
  'composer-2.5',
  'grok-4.7',
  'gpt-5.6-sol',
  'sonnet-4.6',
  'opus-4.6',
  'gpt-5',
] as const;

export type CursorModel = (typeof CURSOR_MODELS)[number];

export const PROPRIETARY_DEFAULT_MODEL: Record<ProprietaryAgentSlug, string> = {
  'claude-code': 'sonnet',
  codex: 'gpt-6.1-sol',
  cursor: 'auto',
};

/** Native cloud provider forced for proprietary CLIs (never ollama/custom). */
export const PROPRIETARY_NATIVE_PROVIDER: Record<
  ProprietaryAgentSlug,
  'anthropic' | 'openai'
> = {
  'claude-code': 'anthropic',
  codex: 'openai',
  cursor: 'openai',
};

export function isProprietaryAgentSlug(
  slug: string,
): slug is ProprietaryAgentSlug {
  return (PROPRIETARY_AGENT_SLUGS as readonly string[]).includes(slug);
}

export function proprietaryModelOptions(
  slug: ProprietaryAgentSlug,
): readonly string[] {
  switch (slug) {
    case 'claude-code':
      return CLAUDE_CODE_MODELS;
    case 'codex':
      return CODEX_MODELS;
    case 'cursor':
      return CURSOR_MODELS;
  }
}
