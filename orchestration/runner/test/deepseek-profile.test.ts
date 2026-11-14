import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeepSeekEnvironment,
  renderDeepSeekConfig,
} from "../src/deepseek-profile.ts";

test("DeepSeek profile reads the credential from an environment variable", () => {
  const config = renderDeepSeekConfig();
  assert.match(config, /model_provider = "deepseek"/);
  assert.match(config, /env_key = "DEEPSEEK_API_KEY"/);
  assert.match(config, /wire_api = "responses"/);
  assert.doesNotMatch(config, /sk-[A-Za-z0-9]/);
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
