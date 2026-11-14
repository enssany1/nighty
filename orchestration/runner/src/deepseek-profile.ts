const ALLOWED_ENVIRONMENT_KEYS = [
  "PATH",
  "SystemRoot",
  "USERPROFILE",
  "TEMP",
  "TMP",
  "CODEX_HOME",
  "DEEPSEEK_API_KEY",
] as const;

export function renderDeepSeekConfig(): string {
  return [
    'model = "deepseek-flash"',
    'model_provider = "deepseek"',
    'model_reasoning_effort = "high"',
    'preferred_auth_method = "apikey"',
    "",
    "[model_providers.deepseek]",
    'name = "DeepSeek"',
    'base_url = "https://api.deepseek.com"',
    'env_key = "DEEPSEEK_API_KEY"',
    'wire_api = "responses"',
    "",
  ].join("\n");
}

export function buildDeepSeekEnvironment(
  source: Record<string, string | undefined>,
): Record<string, string> {
  if (!source.DEEPSEEK_API_KEY?.trim()) {
    throw new Error("DEEPSEEK_API_KEY is required for DeepSeek execution");
  }
  const result: Record<string, string> = {};
  for (const key of ALLOWED_ENVIRONMENT_KEYS) {
    const value = source[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}
