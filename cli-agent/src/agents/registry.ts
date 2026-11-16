import { aiderAdapter } from './aider/adapter';
import { claudeCodeAdapter } from './claude-code/adapter';
import { clineAdapter } from './cline/adapter';
import { codexAdapter } from './codex/adapter';
import { crushAdapter } from './crush/adapter';
import { cursorAdapter } from './cursor/adapter';
import { gooseAdapter } from './goose/adapter';
import { hermesAdapter } from './hermes/adapter';
import { kiloAdapter } from './kilo/adapter';
import { openclawAdapter } from './openclaw/adapter';
import { opencodeAdapter } from './opencode/adapter';
import { openhandsAdapter } from './openhands/adapter';
import { piAdapter } from './pi/adapter';
import { qwenAdapter } from './qwen/adapter';
import type { CliAgentAdapter } from './types';
import { zaiAdapter } from './zai/adapter';

export const CLI_AGENT_ADAPTERS: readonly CliAgentAdapter[] = [
  hermesAdapter,
  claudeCodeAdapter,
  codexAdapter,
  cursorAdapter,
  aiderAdapter,
  opencodeAdapter,
  zaiAdapter,
  kiloAdapter,
  clineAdapter,
  piAdapter,
  qwenAdapter,
  gooseAdapter,
  crushAdapter,
  openclawAdapter,
  openhandsAdapter,
];

export function getAdapter(slug: string): CliAgentAdapter | undefined {
  return CLI_AGENT_ADAPTERS.find((adapter) => adapter.slug === slug);
}
