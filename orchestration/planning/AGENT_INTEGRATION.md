# Agent Integration Feasibility

**Status:** Planning only  
**Observed on:** 14 November 2026

## Evidence categories

### Locally observed

| Capability | Result |
|---|---|
| Codex executable | Installed at `C:\Users\Yahya\AppData\Roaming\npm\codex.ps1` |
| Codex version | `codex-cli 0.154.0` |
| Codex authentication | `Logged in using ChatGPT` |
| Noninteractive execution | `codex exec`; prompt/stdin, `--json`, `--output-schema`, `--output-last-message`, working directory, sandbox, and approval flags are exposed |
| Independent review | `codex review` supports uncommitted, base-branch, or commit review |
| DeepSeek executable | Not found |
| DeepSeek environment credential | `DEEPSEEK_API_KEY` not present in inspected process |
| Supporting tools | Node `24.4.0`; npm `11.15.0`; Git `2.56.0.windows.4`; Docker `29.6.1` |

The Codex commands emitted a nonfatal warning because they could not create temporary PATH aliases in the current restricted inspection context. This must be tested under the eventual runner account.

### Documentation-derived

- DeepSeek provides OpenAI-compatible Chat Completions and Responses APIs and requires an API key: <https://api-docs.deepseek.com/en/>.
- DeepSeek documents using its Responses API as a Codex model provider: <https://api-docs.deepseek.com/quick_start/agent_integrations/codex/>.
- The current DeepSeek model catalog on that page declares a minimum Codex client version of `0.164.0`; the locally installed `0.154.0` does not meet it.
- DeepSeek API conversations are stateless unless the client resends history: <https://api-docs.deepseek.com/guides/multi_round_chat/>.

### Inference

Codex can be automated now for bounded planning/review invocations. DeepSeek development is technically feasible through a coding harness, but it is not currently runnable on this machine because the documented Codex integration version and credential prerequisites are unmet.

## Recommended integration

Use Codex CLI as the controlled harness for both roles, with strictly isolated configuration and model providers:

- **Controller:** existing authenticated OpenAI/Codex configuration; noninteractive `exec` for task creation and `review`/`exec` for evidence-based review.
- **Developer:** a separate, project-scoped Codex configuration/session root configured for the DeepSeek provider. This satisfies the required DeepSeek role while reusing a harness that can edit files, run allowlisted tests, return structured events, and honor a workspace boundary.

Isolation is mandatory because current DeepSeek guidance changes shared Codex configuration and provider-scoped session visibility. Do not run the published one-click script against the user's active shared configuration. During implementation, first prove a separate configuration/session root and secure credential injection in a disposable test directory.

## Required invocation controls

- Explicit `-C E:\Nighty` working directory.
- Workspace-write sandbox or a narrower approved policy; never danger-full-access.
- No automatic external approvals beyond predefined project operations.
- JSONL event capture and a strict final output schema.
- Bounded timeout, output size, and process-family cleanup.
- A per-run instruction bundle containing only the active task and required context.
- Separate run/session identifiers for controller and developer.
- Exit code plus final structured output; neither alone establishes task success.

## Credential handling

The exact secure DeepSeek credential mechanism remains to be proven against the approved Codex version. Requirements:

- No key in Git, Markdown, task files, logs, command arguments, or application `.env` files.
- Prefer an environment-variable or Windows credential-store injection supported by the selected adapter.
- If the provider only supports a configuration field, use a runner-owned, access-controlled temporary configuration and remove it after the process, with no key in backups.
- Redact provider request headers and error payloads.
- Do not inherit the full ambient environment; pass an allowlisted environment.

## Session continuity

- V1 tasks should be self-contained and use fresh agent invocations to minimize hidden state.
- Correction attempts receive the original task, latest review, current diff, and relevant prior delivery; they do not depend on chat memory.
- Any resume feature is an optimization only after run identity and replay behavior are verified.

## Error mapping

| Condition | Orchestration result |
|---|---|
| Process cannot start | EXECUTION_FAILED / dependency |
| Authentication or quota failure | BLOCKED after bounded retry; human action required |
| Timeout | EXECUTION_FAILED; inspect ownership before retry |
| Nonzero exit with source changes | Preserve diff; HUMAN_REVIEW before retry |
| Missing/invalid structured result | INVALID_REPORT |
| Review process failure | Preserve DELIVERED; never approve |

## Feasibility conclusion

The proposed automation is feasible in principle but **not ready to activate**. Codex control is verified locally. DeepSeek control is conditional on: human approval of the isolated Codex-harness approach, an approved Codex upgrade to a compatible version, a DeepSeek API key, and a successful sandboxed proof-of-concept that edits and tests only a disposable repository.
