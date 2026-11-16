/**
 * Open-source CLIs share the local model. Proprietary CLIs take a model
 * from their own env var and must not inherit the open-source id.
 */
export function resolveAgentRun(agent, opensource, env = process.env) {
  if (agent.lane === 'opensource') {
    return {
      slug: agent.slug,
      lane: agent.lane,
      toolName: agent.toolName,
      title: agent.title,
      provider: agent.provider ?? opensource.provider,
      model: agent.model ?? opensource.model,
      baseUrl: agent.baseUrl ?? opensource.baseUrl,
    };
  }
  const model = String(env[agent.modelEnv] ?? '').trim();
  if (!model) {
    throw new Error(
      `${agent.slug}: set ${agent.modelEnv} to the proprietary model`,
    );
  }
  const banned = new Set(
    [opensource.model, `openai/${opensource.model}`].map((id) => id.toLowerCase()),
  );
  if (banned.has(model.toLowerCase())) {
    throw new Error(
      `${agent.slug}: ${agent.modelEnv} must differ from the opensource model ${opensource.model}`,
    );
  }
  return {
    slug: agent.slug,
    lane: agent.lane,
    toolName: agent.toolName,
    title: agent.title,
    provider: agent.provider,
    model,
    baseUrl: String(env[`${agent.modelEnv}_BASE_URL`] ?? '').trim(),
  };
}

export function planMatrix(matrix, env = process.env, { requireProprietary = false } = {}) {
  return matrix.agents.map((agent) => {
    if (agent.lane === 'proprietary' && !requireProprietary) {
      const model = String(env[agent.modelEnv] ?? '').trim();
      return {
        slug: agent.slug,
        lane: agent.lane,
        toolName: agent.toolName,
        title: agent.title,
        provider: agent.provider,
        model: model || null,
        modelEnv: agent.modelEnv,
        baseUrl: model
          ? String(env[`${agent.modelEnv}_BASE_URL`] ?? '').trim()
          : '',
      };
    }
    return resolveAgentRun(agent, matrix.opensource, env);
  });
}
