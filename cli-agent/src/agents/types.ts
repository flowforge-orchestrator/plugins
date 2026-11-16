import type { McpAttach } from '../tools/mcp-attach';
import type { RulesAttach, SkillAttach } from '../tools/skill-attach';

/** Wave A + B (+ C when headless is known). Keep open for catalog growth. */
export type AgentSlug = string;

export type AdapterRequest = {
  task: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  tools: string[];
  /** Legacy name filter; prefer skillAttach for content. */
  skills: string[];
  workspaceMounted: boolean;
  /** Opaque MCP attach from ToolProvider (adapters must not invent servers). */
  mcpAttach: McpAttach | null;
  /** Opaque skills from SkillProvider. */
  skillAttach: SkillAttach | null;
  /** Opaque rules / AGENTS.md from RulesProvider. */
  rulesAttach: RulesAttach | null;
};

export type AdapterPlan =
  | {
      ok: true;
      image: string;
      command: string[];
      env: Record<string, string>;
      workingDir: string;
    }
  | { ok: false; reason: string };

export type UsageParse = {
  usageKnown: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type CliAgentAdapter = {
  slug: AgentSlug;
  displayName: string;
  description: string;
  image: string;
  supportsToolsFilter: boolean;
  supportsSkillsFilter: boolean;
  plan(request: AdapterRequest): AdapterPlan;
  parseUsage(stdout: string, stderr: string): UsageParse;
  extractText(stdout: string, stderr: string): string;
};
