import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { assertControlArtifactPath } from "./bounded-io.ts";

const ALLOWED_ENVIRONMENT_KEYS = [
  "PATH",
  "SystemRoot",
  "USERPROFILE",
  "TEMP",
  "TMP",
  "DEEPSEEK_API_KEY",
] as const;

const RUNNER_HOME_SEGMENTS = ["orchestration", "status", "codex-home-deepseek"];

export type RunnerCodexHome = {
  codexHome: string;
  configPath: string;
};

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

export function resolveRunnerCodexHome(projectRoot: string): string {
  return path.join(path.resolve(projectRoot), ...RUNNER_HOME_SEGMENTS);
}

function sharedUserCodexHome(): string | null {
  const profile = process.env.USERPROFILE?.trim();
  return profile ? path.resolve(profile, ".codex") : null;
}

function assertNotSharedUserHome(codexHome: string): void {
  const shared = sharedUserCodexHome();
  if (shared === null) return;
  const resolved = path.resolve(codexHome);
  const relative = path.relative(shared, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("runner CODEX_HOME must not use the shared user Codex configuration");
  }
}

/**
 * Creates an isolated, runner-owned Codex configuration directory. This step
 * intentionally requires no credential: only a later live invocation needs
 * DEEPSEEK_API_KEY, and the key is never written to this configuration.
 */
export function prepareRunnerCodexHome(input: { projectRoot: string }): RunnerCodexHome {
  const projectRoot = path.resolve(input.projectRoot);
  const codexHome = resolveRunnerCodexHome(projectRoot);
  assertNotSharedUserHome(codexHome);
  assertControlArtifactPath(codexHome);

  if (existsSync(codexHome)) {
    const stats = lstatSync(codexHome);
    if (stats.isSymbolicLink()) {
      throw new Error("runner CODEX_HOME traverses a symbolic link or reparse point");
    }
    if (!stats.isDirectory()) {
      throw new Error("runner CODEX_HOME exists but is not a directory");
    }
  }
  mkdirSync(codexHome, { recursive: true });
  if (lstatSync(codexHome).isSymbolicLink()) {
    throw new Error("runner CODEX_HOME traverses a symbolic link or reparse point");
  }

  const configPath = path.join(codexHome, "config.toml");
  const temporaryPath = configPath + "." + randomUUID() + ".tmp";
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, renderDeepSeekConfig(), { encoding: "utf8", mode: 0o600 });
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, configPath);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporaryPath, { force: true });
    throw error;
  }
  return { codexHome, configPath };
}

/**
 * Builds the execution environment for the DeepSeek developer. The CODEX_HOME
 * is always the runner-owned directory; an ambient override is rejected
 * instead of being silently honored.
 */
export function buildDeepSeekExecutionEnvironment(
  source: Record<string, string | undefined>,
  options: { projectRoot: string; codexHome: string },
): Record<string, string> {
  const environment = buildDeepSeekEnvironment(source);
  const projectRoot = path.resolve(options.projectRoot);
  const codexHome = path.resolve(options.codexHome);
  const relative = path.relative(projectRoot, codexHome);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("runner CODEX_HOME must be inside the project root");
  }
  assertNotSharedUserHome(codexHome);

  const ambient = source.CODEX_HOME?.trim();
  if (ambient && path.resolve(ambient).toLowerCase() !== codexHome.toLowerCase()) {
    throw new Error("ambient CODEX_HOME must not override the runner-owned configuration");
  }

  environment.CODEX_HOME = codexHome;
  return environment;
}
