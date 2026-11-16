import {
  executorsFromClasses,
  type ExecutorClass,
  type ExecutorEntry,
} from '@kosolapus/plugin-ts-sdk';
import { AiderCliAgentExecutor } from './aider/executor';
import { ClaudeCodeCliAgentExecutor } from './claude-code/executor';
import { ClineCliAgentExecutor } from './cline/executor';
import { CodexCliAgentExecutor } from './codex/executor';
import { CrushCliAgentExecutor } from './crush/executor';
import { CursorCliAgentExecutor } from './cursor/executor';
import { GooseCliAgentExecutor } from './goose/executor';
import { HermesCliAgentExecutor } from './hermes/executor';
import { KiloCliAgentExecutor } from './kilo/executor';
import { OpenclawCliAgentExecutor } from './openclaw/executor';
import { OpencodeCliAgentExecutor } from './opencode/executor';
import { OpenhandsCliAgentExecutor } from './openhands/executor';
import { PiCliAgentExecutor } from './pi/executor';
import { QwenCliAgentExecutor } from './qwen/executor';
import { ZaiCliAgentExecutor } from './zai/executor';
import { ToolInstanceExecutor } from '../tools/tool-instance.executor';
import { ToolProviderExecutor } from '../tools/tool-provider.executor';
import { SkillInstanceExecutor } from '../tools/skill-instance.executor';
import { SkillProviderExecutor } from '../tools/skill-provider.executor';
import { RulesInstanceExecutor } from '../tools/rules-instance.executor';
import { RulesProviderExecutor } from '../tools/rules-provider.executor';
import { LlmConfigExecutor } from '../tools/llm-config.executor';
import { GigachatConfigExecutor } from '../tools/gigachat-config.executor';
import { AgentFactoryExecutor } from '../a2a/executor';
import { AgentProfileExecutor } from '../a2a/profile/profile.executor';

const EXECUTOR_CLASSES = [
  LlmConfigExecutor,
  GigachatConfigExecutor,
  ToolInstanceExecutor,
  ToolProviderExecutor,
  SkillInstanceExecutor,
  SkillProviderExecutor,
  RulesInstanceExecutor,
  RulesProviderExecutor,
  HermesCliAgentExecutor,
  ClaudeCodeCliAgentExecutor,
  CodexCliAgentExecutor,
  CursorCliAgentExecutor,
  AiderCliAgentExecutor,
  OpencodeCliAgentExecutor,
  ZaiCliAgentExecutor,
  KiloCliAgentExecutor,
  ClineCliAgentExecutor,
  PiCliAgentExecutor,
  QwenCliAgentExecutor,
  GooseCliAgentExecutor,
  CrushCliAgentExecutor,
  OpenclawCliAgentExecutor,
  OpenhandsCliAgentExecutor,
  AgentFactoryExecutor,
  AgentProfileExecutor,
] as const;

export function getCliAgentExecutors(): ExecutorEntry[] {
  return executorsFromClasses(
    EXECUTOR_CLASSES as unknown as readonly ExecutorClass[],
  );
}
