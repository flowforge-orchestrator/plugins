import type { ContainerSpec } from './docker-args';
import { runContainer } from './docker-engine';

export type DockerResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export async function runDocker(
  spec: ContainerSpec,
  timeoutMs: number,
): Promise<DockerResult> {
  return runContainer(spec, timeoutMs);
}
