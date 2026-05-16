import {
  executorsFromClasses,
  type ExecutorClass,
  type ExecutorEntry,
} from '@kosolapus/plugin-ts-sdk';
import { LlmOllamaGenerateExecutor } from './ollama/generate/executor';
import { LlmOpenAiGenerateExecutor } from './openai/generate/executor';
import { HuggingfaceInferenceExecutor } from './huggingface/inference/inference.executor';

const EXECUTOR_CLASSES = [
  LlmOllamaGenerateExecutor,
  LlmOpenAiGenerateExecutor,
  HuggingfaceInferenceExecutor,
] as const;

export function getLlmExecutors(): ExecutorEntry[] {
  return executorsFromClasses(
    EXECUTOR_CLASSES as unknown as readonly ExecutorClass[],
  );
}
