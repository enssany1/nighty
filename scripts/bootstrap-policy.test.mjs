import assert from "node:assert/strict";
import test from "node:test";

import { decideBootstrap } from "./bootstrap-policy.mjs";

test("established databases skip without retaining bootstrap credentials", () => {
  assert.equal(decideBootstrap({ existingUserCount: 1, username: "", password: "" }), "skip");
});

test("empty databases fail closed without a valid username", () => {
  assert.throws(
    () => decideBootstrap({ existingUserCount: 0, username: "", password: "long-enough-password" }),
    /USERNAME is required/,
  );
});

test("empty databases fail closed without a valid password", () => {
  assert.throws(
    () => decideBootstrap({ existingUserCount: 0, username: "admin", password: "short" }),
    /PASSWORD is required/,
  );
});

test("empty databases accept valid one-time bootstrap credentials", () => {
  assert.equal(
    decideBootstrap({ existingUserCount: 0, username: "admin", password: "long-enough-password" }),
    "create",
  );
});

test("invalid database facts fail closed", () => {
  assert.throws(
    () => decideBootstrap({ existingUserCount: Number.NaN, username: "admin", password: "long-enough-password" }),
    /non-negative integer/,
  );
});
