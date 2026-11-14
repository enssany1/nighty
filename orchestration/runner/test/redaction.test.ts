import assert from "node:assert/strict";
import test from "node:test";

import { SecretRedactor, redactDeep } from "../src/redaction.ts";

const SECRET = "test-only-credential-3f9a8b7c6d5e4f3a2b1c";

test("redactor removes the explicit secret everywhere in text", () => {
  const redactor = new SecretRedactor([SECRET]);
  const text = [
    "authorization: Bearer " + SECRET,
    'json: {"key":"' + SECRET + '"}',
    "encoded: " + encodeURIComponent(SECRET),
    "escaped: " + JSON.stringify(SECRET).slice(1, -1),
  ].join("\n");

  const redacted = redactor.redact(text);
  assert.equal(redacted.includes(SECRET), false);
  assert.match(redacted, /\[REDACTED\]/);
});

test("redactor applies to nested persisted values without touching other text", () => {
  const redactor = new SecretRedactor([SECRET, undefined, ""]);
  const value = {
    reason: "failed with " + SECRET,
    nested: [{ stderr: SECRET }],
    safe: "unchanged",
  };

  const redacted = redactDeep(value, redactor);
  assert.deepEqual(redacted, {
    reason: "failed with [REDACTED]",
    nested: [{ stderr: "[REDACTED]" }],
    safe: "unchanged",
  });
  assert.equal(JSON.stringify(redacted).includes(SECRET), false);
});

test("redactor ignores trivially short values and never reports them", () => {
  const redactor = new SecretRedactor(["abc"]);
  assert.equal(redactor.isEmpty, true);
  assert.equal(redactor.redact("abc remains"), "abc remains");
});

