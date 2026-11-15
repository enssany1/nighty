import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildDeepSeekEnvironment,
  buildDeepSeekExecutionEnvironment,
  prepareRunnerCodexHome,
  renderDeepSeekConfig,
  resolveRunnerCodexHome,
} from "../src/deepseek-profile.ts";

function withTemp(run: (directory: string) => void): void {
  const directory = mkdtempSync(path.join(tmpdir(), "nighty-deepseek-"));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("DeepSeek profile reads the credential from an environment variable", () => {
  const config = renderDeepSeekConfig();
  assert.match(config, /model_provider = "deepseek"/);
  assert.match(config, /env_key = "DEEPSEEK_API_KEY"/);
  assert.match(config, /wire_api = "responses"/);
  assert.doesNotMatch(config, /sk-[A-Za-z0-9]/);
});

test("DeepSeek profile disables autonomous shell commands", () => {
  const config = renderDeepSeekConfig();
  assert.match(config, /\[features\]\nshell_tool = false/);
});

test("DeepSeek environment is allowlisted and includes the explicit key", () => {
  const environment = buildDeepSeekEnvironment({
    PATH: "tools",
    SystemRoot: "C:\\Windows",
    USERPROFILE: "C:\\Users\\Yahya",
    DEEPSEEK_API_KEY: "secret-for-test",
    UNRELATED_SECRET: "must-not-pass",
  });
  assert.deepEqual(environment, {
    PATH: "tools",
    SystemRoot: "C:\\Windows",
    USERPROFILE: "C:\\Users\\Yahya",
    DEEPSEEK_API_KEY: "secret-for-test",
  });
});

test("DeepSeek execution fails closed when the credential is absent", () => {
  assert.throws(
    () => buildDeepSeekEnvironment({ PATH: "tools" }),
    /DEEPSEEK_API_KEY is required/,
  );
});

test("runner-owned Codex home is prepared without any credential", () => {
  withTemp((directory) => {
    const home = prepareRunnerCodexHome({ projectRoot: directory });
    const expected = path.join(directory, "orchestration", "status", "codex-home-deepseek");

    assert.equal(home.codexHome, expected);
    assert.equal(home.configPath, path.join(expected, "config.toml"));
    assert.equal(existsSync(home.configPath), true);
    assert.match(readFileSync(home.configPath, "utf8"), /model_provider = "deepseek"/);
    assert.doesNotMatch(readFileSync(home.configPath, "utf8"), /sk-[A-Za-z0-9]/);
    assert.notEqual(
      path.resolve(home.codexHome).toLowerCase(),
      path.resolve(process.env.USERPROFILE ?? "", ".codex").toLowerCase(),
    );
  });
});

test("runner-owned Codex home rejects a reparse point", () => {
  withTemp((directory) => {
    const target = path.join(directory, "elsewhere");
    const statusDirectory = path.join(directory, "orchestration", "status");
    mkdirSync(statusDirectory, { recursive: true });
    mkdirSync(target, { recursive: true });
    symlinkSync(target, resolveRunnerCodexHome(directory), "junction");

    assert.throws(
      () => prepareRunnerCodexHome({ projectRoot: directory }),
      /reparse point|symbolic link/i,
    );
  });
});

test("DeepSeek execution environment always uses the runner-owned CODEX_HOME", () => {
  withTemp((directory) => {
    const home = prepareRunnerCodexHome({ projectRoot: directory });
    const environment = buildDeepSeekExecutionEnvironment(
      {
        PATH: "tools",
        SystemRoot: "C:\\Windows",
        DEEPSEEK_API_KEY: "secret-for-test",
        UNRELATED_SECRET: "must-not-pass",
      },
      { projectRoot: directory, codexHome: home.codexHome },
    );

    assert.equal(environment.CODEX_HOME, home.codexHome);
    assert.equal(environment.DEEPSEEK_API_KEY, "secret-for-test");
    assert.equal(environment.UNRELATED_SECRET, undefined);
  });
});

test("DeepSeek execution refuses a shared or out-of-root CODEX_HOME", () => {
  withTemp((directory) => {
    const shared = path.join(process.env.USERPROFILE ?? directory, ".codex");
    assert.throws(
      () => buildDeepSeekExecutionEnvironment(
        { PATH: "tools", DEEPSEEK_API_KEY: "secret-for-test" },
        { projectRoot: directory, codexHome: shared },
      ),
      /must not use the shared user Codex configuration|must be inside the project root/,
    );
    assert.throws(
      () => buildDeepSeekExecutionEnvironment(
        { PATH: "tools", DEEPSEEK_API_KEY: "secret-for-test" },
        { projectRoot: directory, codexHome: path.join(directory, "..", "outside-codex-home") },
      ),
      /must be inside the project root/,
    );
  });
});

test("DeepSeek execution rejects an ambient CODEX_HOME override", () => {
  withTemp((directory) => {
    const home = prepareRunnerCodexHome({ projectRoot: directory });
    const ambient = path.join(directory, "ambient-codex-home");
    assert.throws(
      () => buildDeepSeekExecutionEnvironment(
        { PATH: "tools", DEEPSEEK_API_KEY: "secret-for-test", CODEX_HOME: ambient },
        { projectRoot: directory, codexHome: home.codexHome },
      ),
      /ambient CODEX_HOME/,
    );
  });
});
