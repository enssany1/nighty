import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  discoverArtifacts,
  quarantineArtifact,
} from "./artifact-inbox.ts";
import {
  BoundedReadError,
  decodeUtf8Strict,
  readBoundedBytes,
  readBoundedUtf8File,
} from "./bounded-io.ts";
import { inspectGit, type GitInspection } from "./git-gate.ts";
import { GitCheckpoint } from "./git-checkpoint.ts";
import {
  createApprovalBinding,
  verifyCheckpointIntegrity,
} from "./approval.ts";
import {
  parseMarkdownArtifact,
  type ParsedMarkdownArtifact,
} from "./markdown.ts";
import type { ProcessResult, ProcessStartIdentity } from "./process-supervisor.ts";
import { validateDelivery, validateReview } from "./protocol.ts";
import { decideRecovery } from "./recovery.ts";
import { SecretRedactor } from "./redaction.ts";
import {
  type LeaseRecord,
  type StateStore,
  type TaskRecord,
  type TaskState,
} from "./state-store.ts";
import type { VerificationRegistry } from "./verification-registry.ts";

export type ReconcileActionKind =
  | "IDLE"
  | "WAIT"
  | "DELIVERY_RECORDED"
  | "DELIVERY_DUPLICATE"
  | "DELIVERY_INVALID"
  | "CONFLICT_QUARANTINED"
  | "REVIEW_RECORDED"
  | "REVIEW_INVALID"
  | "CHECKPOINTED"
  | "EXECUTION_FAILED";

export type ReconcileAction = {
  kind: ReconcileActionKind;
  taskId?: string;
  attempt?: string;
  digest?: string;
  decision?: string;
  reason?: string;
  quarantinePath?: string;
  advancedOnly?: boolean;
  errors?: string[];
  commit?: string;
};

export type GitCheckpointService = Pick<GitCheckpoint, "assertCleanBaseline" | "commit">;

export type ReconcileResult = {
  actions: ReconcileAction[];
  activeTask: TaskRecord | null;
};

export type ArtifactProducer = {
  run(input: {
    taskId: string;
    revision: number;
    attempt: string;
    prompt: string;
    outputPath: string;
    outputSchemaPath: string;
    onProcessStarted?: (identity: ProcessStartIdentity) => void;
  }): Promise<{ process: Pick<ProcessResult, "exitCode" | "timedOut"> }>;
};

export type ReconcilerOptions = {
  root: string;
  state: StateStore;
  deliveriesDirectory: string;
  reviewsDirectory: string;
  quarantineDirectory: string;
  tasksDirectory?: string;
  maxArtifactBytes?: number;
  maxTaskBytes?: number;
  verification?: VerificationRegistry;
  verificationEnvironment?: Record<string, string>;
  redactor?: SecretRedactor;
  inspectSource?: (root: string) => GitInspection;
  isPidAlive?: (pid: number) => boolean;
  producerDescendantAlive?: (taskId: string) => boolean;
  developer?: ArtifactProducer;
  reviewer?: ArtifactProducer;
  schemasDirectory?: string;
  developerLeaseMs?: number;
  reviewerLeaseMs?: number;
  heartbeatIntervalMs?: number;
  gitCheckpoint?: GitCheckpointService;
};

type ReadArtifact = {
  name: string;
  filePath: string;
  digest: string;
  parsed: ParsedMarkdownArtifact;
};

const DELIVERY_NAME = /^(TASK-[0-9]{3})-(A[0-9]{2})-DELIVERY\.md$/;
const REVIEW_NAME = /^(TASK-[0-9]{3})-(A[0-9]{2})-REVIEW\.md$/;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function defaultIsPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function minimalVerificationEnvironment(): Record<string, string> {
  const allowed = [
    "PATH",
    "SystemRoot",
    "SystemDrive",
    "windir",
    "TEMP",
    "TMP",
    "PATHEXT",
    "COMSPEC",
    "USERPROFILE",
    "HOME",
  ];
  const environment: Record<string, string> = {};
  for (const key of allowed) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function attemptNumber(attempt: string): number {
  return Number(attempt.slice(1));
}

function attemptFromName(name: string, pattern: RegExp): string {
  const match = pattern.exec(name);
  if (!match) throw new Error("unrecognized artifact name: " + name);
  return match[2] as string;
}

export class Reconciler {
  readonly #options: ReconcilerOptions;
  readonly #redactor: SecretRedactor;
  readonly #maxArtifactBytes: number;
  readonly #maxTaskBytes: number;
  readonly #isPidAlive: (pid: number) => boolean;
  readonly #gitCheckpoint: GitCheckpointService;

  constructor(options: ReconcilerOptions) {
    this.#options = options;
    this.#redactor = options.redactor ?? new SecretRedactor([]);
    this.#maxArtifactBytes = options.maxArtifactBytes ?? 2 * 1024 * 1024;
    this.#maxTaskBytes = options.maxTaskBytes ?? 1024 * 1024;
    this.#isPidAlive = options.isPidAlive ?? defaultIsPidAlive;
    this.#gitCheckpoint = options.gitCheckpoint ?? new GitCheckpoint({ root: options.root });
  }

  get #tasksDirectory(): string {
    return this.#options.tasksDirectory ?? path.join(this.#options.root, "orchestration", "tasks");
  }

  get #schemasDirectory(): string {
    return (
      this.#options.schemasDirectory
      ?? path.join(this.#options.root, "orchestration", "runner", "schemas")
    );
  }

  readTaskPrompt(taskId: string): string {
    if (!/^TASK-[0-9]{3}$/.test(taskId)) throw new Error("invalid task identifier");
    const filePath = path.join(this.#tasksDirectory, taskId + ".md");
    const text = readBoundedUtf8File(filePath, {
      maxBytes: this.#maxTaskBytes,
      rejectControlArtifacts: true,
    });
    if (text.includes("\u0000")) throw new Error("task prompt contains a NUL character");
    return text;
  }

  #taskDigest(taskId: string): string {
    if (!/^TASK-[0-9]{3}$/.test(taskId)) throw new Error("invalid task identifier");
    const filePath = path.join(this.#tasksDirectory, taskId + ".md");
    return sha256(
      readBoundedBytes(filePath, {
        maxBytes: this.#maxTaskBytes,
        rejectControlArtifacts: true,
      }),
    );
  }

  inspectSource(): GitInspection {
    return (this.#options.inspectSource ?? inspectGit)(this.#options.root);
  }

  async runVerification(id: string, cwd = this.#options.root): Promise<ProcessResult> {
    if (!this.#options.verification) {
      throw new Error("no verification registry is configured");
    }
    return await this.#options.verification.run(
      id,
      cwd,
      this.#options.verificationEnvironment ?? minimalVerificationEnvironment(),
    );
  }

  async reconcileOnce(): Promise<ReconcileResult> {
    const active = this.#options.state.getActiveTask();
    if (!active) {
      return {
        actions: [{ kind: "IDLE", reason: "no active task owns the workflow" }],
        activeTask: null,
      };
    }
    switch (active.state) {
      case "IN_DEVELOPMENT":
        return { actions: [this.#reconcileDevelopment(active)], activeTask: active };
      case "DELIVERED":
      case "UNDER_REVIEW":
        return { actions: [this.#reconcileReview(active)], activeTask: active };
      default:
        return {
          actions: [
            {
              kind: "WAIT",
              taskId: active.taskId,
              reason: this.#redactor.redact("state " + active.state + " requires no artifact reconciliation"),
            },
          ],
          activeTask: active,
        };
    }
  }

  #activeLease(taskId: string): {
    lease: LeaseRecord | undefined;
    leaseExpired: boolean;
    ownedProcessAlive: boolean;
    descendantAlive: boolean;
  } {
    const lease = this.#options.state.getLease(taskId);
    const leaseExpired = lease ? lease.expired : true;
    let ownedProcessAlive = false;
    if (lease?.pid != null) ownedProcessAlive = this.#isPidAlive(lease.pid);
    else if (lease && !lease.expired) ownedProcessAlive = true;
    return {
      lease,
      leaseExpired,
      ownedProcessAlive,
      descendantAlive: this.#options.producerDescendantAlive?.(taskId) ?? false,
    };
  }

  #deliveryNames(taskId: string): string[] {
    return discoverArtifacts(this.#options.deliveriesDirectory)
      .filter((name) => {
        const match = DELIVERY_NAME.exec(name);
        return match !== null && match[1] === taskId;
      })
      .sort((left, right) => {
        return attemptNumber(attemptFromName(right, DELIVERY_NAME))
          - attemptNumber(attemptFromName(left, DELIVERY_NAME));
      });
  }

  #reviewNames(taskId: string, attempt: string): string[] {
    return discoverArtifacts(this.#options.reviewsDirectory).filter((name) => {
      const match = REVIEW_NAME.exec(name);
      return match !== null && match[1] === taskId && match[2] === attempt;
    });
  }

  #readArtifact(directory: string, name: string): ReadArtifact {
    const filePath = path.join(directory, name);
    const bytes = readBoundedBytes(filePath, {
      maxBytes: this.#maxArtifactBytes,
      rejectControlArtifacts: true,
    });
    const text = decodeUtf8Strict(bytes, filePath);
    return {
      name,
      filePath,
      digest: sha256(bytes),
      parsed: parseMarkdownArtifact(text, { maxBytes: this.#maxArtifactBytes }),
    };
  }

  #quarantine(
    directory: string,
    name: string,
    reason: string,
    expectedDigest?: string | null,
    actualDigest?: string,
  ): string | null {
    try {
      const result = quarantineArtifact({
        directory,
        name,
        quarantineDirectory: this.#options.quarantineDirectory,
        reason: this.#redactor.redact(reason),
        ...(expectedDigest !== undefined && expectedDigest !== null
          ? { expectedDigest }
          : {}),
        ...(actualDigest !== undefined ? { actualDigest } : {}),
      });
      return result.quarantinedPath;
    } catch {
      return null;
    }
  }

  #safeTransition(
    task: TaskRecord,
    expected: TaskState,
    next: TaskState,
    reason: string,
  ): boolean {
    try {
      this.#options.state.transition(task.taskId, expected, next, this.#redactor.redact(reason), {
        expectedRevision: task.revision,
      });
      return true;
    } catch (error) {
      if (this.#options.state.getTask(task.taskId)?.state === next) return false;
      throw error;
    }
  }

  #validateDeliveryArtifact(
    task: TaskRecord,
    attempt: string,
    artifact: ReadArtifact,
  ): { ok: boolean; errors: string[] } {
    const frontMatter = artifact.parsed.frontMatter;
    const errors: string[] = [];
    if (frontMatter.schema !== "nighty.delivery/v1") errors.push("invalid delivery schema");
    if (frontMatter.task_id !== task.taskId) errors.push("task identity mismatch");
    if (frontMatter.task_revision !== task.revision) errors.push("task revision mismatch");
    if (frontMatter.attempt !== attempt) errors.push("attempt identity mismatch");
    if (frontMatter.status !== "DELIVERED") errors.push("delivery status must be DELIVERED");
    const validation = validateDelivery(
      { ...frontMatter, sections: artifact.parsed.sections },
      { taskId: task.taskId, revision: task.revision, attempt },
    );
    errors.push(...validation.errors);
    return { ok: errors.length === 0, errors };
  }

  #reconcileDevelopment(task: TaskRecord): ReconcileAction {
    const names = this.#deliveryNames(task.taskId);
    const state = this.#activeLease(task.taskId);
    const latestRun = this.#options.state.listRuns(task.taskId).at(-1);
    const producerFailed = latestRun?.state === "FAILED" || latestRun?.state === "TIMED_OUT";

    if (names.length === 0) {
      const decision = decideRecovery({
        state: "IN_DEVELOPMENT",
        leaseExpired: state.leaseExpired,
        ownedProcessAlive: state.ownedProcessAlive,
        producerDescendantAlive: state.descendantAlive,
        artifact: null,
        producerFailed,
      });
      if (decision.action === "MARK_EXECUTION_FAILED") {
        this.#safeTransition(task, "IN_DEVELOPMENT", "EXECUTION_FAILED", decision.reason);
        return {
          kind: "EXECUTION_FAILED",
          taskId: task.taskId,
          reason: this.#redactor.redact(decision.reason),
        };
      }
      return {
        kind: "WAIT",
        taskId: task.taskId,
        reason: this.#redactor.redact(decision.reason),
      };
    }

    const name = names[0] as string;
    const attempt = attemptFromName(name, DELIVERY_NAME);
    let artifact: ReadArtifact;
    try {
      artifact = this.#readArtifact(this.#options.deliveriesDirectory, name);
    } catch (error) {
      const reason =
        error instanceof BoundedReadError && error.code === "invalid_utf8"
          ? "delivery is not valid UTF-8"
          : "delivery could not be read within its bounds";
      const quarantinePath = this.#quarantine(
        this.#options.deliveriesDirectory,
        name,
        reason,
      );
      this.#safeTransition(task, "IN_DEVELOPMENT", "INVALID_REPORT", reason);
      return {
        kind: "DELIVERY_INVALID",
        taskId: task.taskId,
        attempt,
        reason,
        ...(quarantinePath !== null ? { quarantinePath } : {}),
      };
    }

    const validation = this.#validateDeliveryArtifact(task, attempt, artifact);
    if (!validation.ok) {
      const quarantinePath = this.#quarantine(
        this.#options.deliveriesDirectory,
        name,
        "delivery failed identity or schema validation",
        null,
        artifact.digest,
      );
      this.#safeTransition(
        task,
        "IN_DEVELOPMENT",
        "INVALID_REPORT",
        "delivery failed identity or schema validation",
      );
      return {
        kind: "DELIVERY_INVALID",
        taskId: task.taskId,
        attempt,
        reason: "delivery failed identity or schema validation",
        errors: validation.errors.map((error) => this.#redactor.redact(error)),
        ...(quarantinePath !== null ? { quarantinePath } : {}),
      };
    }

    const recordedDigest = this.#options.state.getArtifactDigest(
      task.taskId,
      task.revision,
      attempt,
      "delivery",
    );
    const decision = decideRecovery({
      state: "IN_DEVELOPMENT",
      leaseExpired: state.leaseExpired,
      ownedProcessAlive: state.ownedProcessAlive,
      producerDescendantAlive: state.descendantAlive,
      artifact: { digest: artifact.digest, recordedDigest },
      producerFailed,
    });

    if (decision.action === "WAIT") {
      return {
        kind: "WAIT",
        taskId: task.taskId,
        attempt,
        digest: artifact.digest,
        reason: this.#redactor.redact(decision.reason),
      };
    }
    if (decision.action === "HUMAN_REVIEW") {
      const quarantinePath = this.#quarantine(
        this.#options.deliveriesDirectory,
        name,
        decision.reason,
        recordedDigest,
        artifact.digest,
      );
      this.#safeTransition(task, "IN_DEVELOPMENT", "HUMAN_REVIEW", decision.reason);
      return {
        kind: "CONFLICT_QUARANTINED",
        taskId: task.taskId,
        attempt,
        digest: artifact.digest,
        reason: this.#redactor.redact(decision.reason),
        ...(quarantinePath !== null ? { quarantinePath } : {}),
      };
    }
    if (decision.action === "VALIDATE_DELIVERY") {
      try {
        this.#options.state.recordArtifact(task.taskId, attempt, "delivery", artifact.digest, {
          revision: task.revision,
        });
      } catch (error) {
        const current = this.#options.state.getArtifactDigest(
          task.taskId,
          task.revision,
          attempt,
          "delivery",
        );
        if (current !== artifact.digest) throw error;
      }
    }
    if (decision.action === "VALIDATE_DELIVERY" || decision.action === "ADVANCE_DELIVERY") {
      const advanced = this.#safeTransition(
        task,
        "IN_DEVELOPMENT",
        "DELIVERED",
        decision.reason,
      );
      if (!advanced) {
        return {
          kind: "DELIVERY_DUPLICATE",
          taskId: task.taskId,
          attempt,
          digest: artifact.digest,
          reason: "delivery was already advanced by a concurrent reconciler",
        };
      }
      return {
        kind: "DELIVERY_RECORDED",
        taskId: task.taskId,
        attempt,
        digest: artifact.digest,
        ...(decision.action === "ADVANCE_DELIVERY" ? { advancedOnly: true } : {}),
      };
    }
    if (decision.action === "MARK_EXECUTION_FAILED") {
      this.#quarantine(
        this.#options.deliveriesDirectory,
        name,
        decision.reason,
        recordedDigest,
        artifact.digest,
      );
      this.#safeTransition(task, "IN_DEVELOPMENT", "EXECUTION_FAILED", decision.reason);
      return {
        kind: "EXECUTION_FAILED",
        taskId: task.taskId,
        attempt,
        reason: this.#redactor.redact(decision.reason),
      };
    }
    return {
      kind: "WAIT",
      taskId: task.taskId,
      attempt,
      reason: this.#redactor.redact(decision.reason),
    };
  }

  #reviewedAttempt(task: TaskRecord): { attempt: string; deliveryDigest: string | null } | null {
    const names = this.#deliveryNames(task.taskId);
    if (names.length === 0) return null;
    const attempt = attemptFromName(names[0] as string, DELIVERY_NAME);
    return {
      attempt,
      deliveryDigest: this.#options.state.getArtifactDigest(
        task.taskId,
        task.revision,
        attempt,
        "delivery",
      ),
    };
  }

  #reconcileReview(task: TaskRecord): ReconcileAction {
    const reviewed = this.#reviewedAttempt(task);
    if (!reviewed) {
      return { kind: "WAIT", taskId: task.taskId, reason: "no delivery artifact is available for review" };
    }
    if (reviewed.deliveryDigest === null) {
      return { kind: "WAIT", taskId: task.taskId, reason: "delivery has not been recorded yet" };
    }
    const names = this.#reviewNames(task.taskId, reviewed.attempt);
    if (names.length === 0) {
      if (task.state === "DELIVERED") {
        return {
          kind: "DELIVERY_DUPLICATE",
          taskId: task.taskId,
          attempt: reviewed.attempt,
          digest: reviewed.deliveryDigest,
          reason: "delivery is already recorded; no review artifact exists yet",
        };
      }
      return { kind: "WAIT", taskId: task.taskId, attempt: reviewed.attempt, reason: "reviewer lease is not complete" };
    }

    const name = names[0] as string;
    const attempt = attemptFromName(name, REVIEW_NAME);
    let artifact: ReadArtifact;
    try {
      artifact = this.#readArtifact(this.#options.reviewsDirectory, name);
    } catch {
      return this.#invalidateReview(task, name, attempt, "review could not be read within its bounds");
    }

    const frontMatter = artifact.parsed.frontMatter;
    const errors: string[] = [];
    if (frontMatter.schema !== "nighty.review/v1") errors.push("invalid review schema");
    if (frontMatter.task_id !== task.taskId) errors.push("task identity mismatch");
    if (frontMatter.task_revision !== task.revision) errors.push("task revision mismatch");
    if (frontMatter.attempt !== attempt) errors.push("attempt identity mismatch");
    if (frontMatter.delivery_sha256 !== reviewed.deliveryDigest) {
      errors.push("review delivery digest mismatch");
    }
    const taskDigest = this.#taskDigest(task.taskId);
    if (frontMatter.task_sha256 !== taskDigest) {
      errors.push("task content digest mismatch");
    }
    const validation = validateReview(
      { ...frontMatter, sections: artifact.parsed.sections },
      {
        taskId: task.taskId,
        revision: task.revision,
        attempt,
        deliverySha256: reviewed.deliveryDigest,
        taskSha256: taskDigest,
      },
    );
    errors.push(...validation.errors);
    if (errors.length > 0) {
      return this.#invalidateReview(
        task,
        name,
        attempt,
        "review failed identity or schema validation",
        errors,
      );
    }

    const recorded = this.#options.state.getArtifactDigest(
      task.taskId,
      task.revision,
      attempt,
      "review",
    );
    if (recorded !== null && recorded !== artifact.digest) {
      const quarantinePath = this.#quarantine(
        this.#options.reviewsDirectory,
        name,
        "review digest conflicts with recorded identity",
        recorded,
        artifact.digest,
      );
      this.#safeTransition(task, task.state, "HUMAN_REVIEW", "review digest conflicts with recorded identity");
      return {
        kind: "CONFLICT_QUARANTINED",
        taskId: task.taskId,
        attempt,
        digest: artifact.digest,
        reason: "review digest conflicts with recorded identity",
        ...(quarantinePath !== null ? { quarantinePath } : {}),
      };
    }

    try {
      this.#options.state.recordArtifact(task.taskId, attempt, "review", artifact.digest, {
        revision: task.revision,
      });
    } catch (error) {
      const current = this.#options.state.getArtifactDigest(
        task.taskId,
        task.revision,
        attempt,
        "review",
      );
      if (current !== artifact.digest) throw error;
    }

    if (task.state === "DELIVERED") {
      this.#safeTransition(task, "DELIVERED", "UNDER_REVIEW", "review artifact arrived");
    }
    const decision = String(frontMatter.decision);
    const next: TaskState | null =
      decision === "APPROVED"
        ? "APPROVED"
        : decision === "CHANGES_REQUIRED"
          ? "CHANGES_REQUIRED"
          : decision === "BLOCKED"
            ? "BLOCKED"
            : null;
    if (next === null) {
      return this.#invalidateReview(task, name, attempt, "review decision is not recognized");
    }
    this.#safeTransition(task, "UNDER_REVIEW", next, "review decision " + decision);
    return {
      kind: "REVIEW_RECORDED",
      taskId: task.taskId,
      attempt,
      digest: artifact.digest,
      decision,
    };
  }

  #invalidateReview(
    task: TaskRecord,
    name: string,
    attempt: string,
    reason: string,
    errors: string[] = [],
  ): ReconcileAction {
    const quarantinePath = this.#quarantine(
      this.#options.reviewsDirectory,
      name,
      reason,
    );
    if (task.state === "DELIVERED") {
      this.#safeTransition(task, "DELIVERED", "UNDER_REVIEW", "review artifact arrived");
    }
    this.#safeTransition(task, "UNDER_REVIEW", "INVALID_REPORT", reason);
    return {
      kind: "REVIEW_INVALID",
      taskId: task.taskId,
      attempt,
      reason,
      errors: errors.map((error) => this.#redactor.redact(error)),
      ...(quarantinePath !== null ? { quarantinePath } : {}),
    };
  }

  /**
   * Dispatches one development attempt through an injected model runner. The
   * foreground runner calls this only after selecting a ready task; the
   * reconciler owns state/lease identity around the invocation.
   */
  async dispatchDevelopment(taskId: string): Promise<ReconcileAction> {
    const producer = this.#options.developer;
    if (!producer) throw new Error("no developer adapter is configured");
    const task = this.#options.state.getTask(taskId);
    if (!task) throw new Error("unknown task " + taskId);
    if (task.state !== "READY_FOR_DEVELOPMENT" && task.state !== "READY_FOR_CORRECTION") {
      throw new Error("task is not ready for development: " + task.state);
    }
    if (this.#deliveryNames(taskId).length > 0) {
      throw new Error("a delivery artifact is already present for " + taskId);
    }
    const baseline = this.#options.gitCheckpoint
      ? task.state === "READY_FOR_DEVELOPMENT"
        ? this.#gitCheckpoint.assertCleanBaseline()
        : this.inspectSource()
      : null;
    const expected = task.state;
    this.#options.state.transition(taskId, expected, "IN_DEVELOPMENT", "dispatch", {
      expectedRevision: task.revision,
    });
    const attempt = "A" + String(this.#nextAttemptNumber(taskId)).padStart(2, "0");
    this.#options.state.beginAttempt(taskId, task.revision, attempt);
    const leaseMs = this.#options.developerLeaseMs ?? 30 * 60_000;
    const run = this.#options.state.beginRun({
      taskId,
      revision: task.revision,
      attempt,
      role: "developer",
      pid: null,
      leaseMs,
    });
    try {
      const prompt = baseline === null
        ? this.readTaskPrompt(taskId)
        : [
            "Git baseline commit: " + baseline.head,
            "Git branch: " + baseline.branch,
            "The delivery artifact must include baseline_commit: " + baseline.head,
            "",
            this.readTaskPrompt(taskId),
          ].join("\n");
      const outputPath = path.join(
        this.#options.deliveriesDirectory,
        taskId + "-" + attempt + "-DELIVERY.md",
      );
      const result = await this.#withHeartbeat(run.runId, leaseMs, async () =>
        await producer.run({
          taskId,
          revision: task.revision,
          attempt,
          prompt,
          outputPath,
          outputSchemaPath: path.join(this.#schemasDirectory, "delivery.schema.json"),
          onProcessStarted: (identity) => {
            this.#options.state.attachOwnedProcess({
              runId: run.runId,
              pid: identity.rootPid,
              observedAt: identity.startedAt,
              ...(identity.executable ? { executable: identity.executable } : {}),
            });
          },
        }),
      );
      const attached = this.#options.state.getRun(run.runId);
      if (!attached || attached.pid === null) {
        throw new Error("producer did not record provider process ownership");
      }
      const failed =
        result.process.timedOut
        || result.process.exitCode !== 0
        || !existsSync(outputPath);
      this.#options.state.finishRun(run.runId, {
        state: result.process.timedOut ? "TIMED_OUT" : failed ? "FAILED" : "COMPLETED",
        exitCode: result.process.exitCode,
        timedOut: result.process.timedOut,
      });
      if (failed) {
        const reason = "development invocation did not produce a valid artifact";
        this.#safeTransition(task, "IN_DEVELOPMENT", "EXECUTION_FAILED", reason);
        return { kind: "EXECUTION_FAILED", taskId, attempt, reason };
      }
      return {
        kind: "WAIT",
        taskId,
        attempt,
        reason: "development run completed; delivery awaits reconciliation",
      };
    } catch (error) {
      this.#options.state.finishRun(run.runId, {
        state: "FAILED",
        exitCode: null,
        timedOut: false,
      });
      this.#safeTransition(task, "IN_DEVELOPMENT", "EXECUTION_FAILED", "development invocation failed");
      throw error;
    }
  }

  async dispatchReview(taskId: string): Promise<ReconcileAction> {
    const producer = this.#options.reviewer;
    if (!producer) throw new Error("no reviewer adapter is configured");
    const task = this.#options.state.getTask(taskId);
    if (!task) throw new Error("unknown task " + taskId);
    if (task.state !== "DELIVERED") throw new Error("task is not delivered: " + task.state);
    const reviewed = this.#reviewedAttempt(task);
    if (!reviewed || reviewed.deliveryDigest === null) {
      throw new Error("no recorded delivery artifact is available for review");
    }
    if (this.#reviewNames(taskId, reviewed.attempt).length > 0) {
      throw new Error("a review artifact is already present for " + taskId);
    }
    const git = this.inspectSource();
    this.#options.state.transition(taskId, "DELIVERED", "UNDER_REVIEW", "review dispatch", {
      expectedRevision: task.revision,
    });
    const leaseMs = this.#options.reviewerLeaseMs ?? 15 * 60_000;
    const run = this.#options.state.beginRun({
      taskId,
      revision: task.revision,
      attempt: reviewed.attempt,
      role: "reviewer",
      pid: null,
      leaseMs,
    });
    try {
      const deliveryPath = path.join(
        this.#options.deliveriesDirectory,
        taskId + "-" + reviewed.attempt + "-DELIVERY.md",
      );
      const delivery = readBoundedUtf8File(deliveryPath, {
        maxBytes: this.#maxArtifactBytes,
        rejectControlArtifacts: true,
      });
      const taskDigest = this.#taskDigest(taskId);
      const prompt = [
        "Task content SHA-256: " + taskDigest,
        "The review artifact must include task_sha256: " + taskDigest,
        "Review the actual repository state below; do not infer these evidence values.",
        "The review artifact must include head_commit: " + git.head,
        "The review artifact must include branch: " + git.branch,
        "The review artifact must include source_sha256: " + git.sourceSha256,
        "The review artifact must include tree_sha256: " + git.inventorySha256,
        "Repository evidence JSON: " + JSON.stringify(git),
        "",
        this.readTaskPrompt(taskId),
        "",
        "---",
        "",
        delivery,
      ].join("\n");
      const outputPath = path.join(
        this.#options.reviewsDirectory,
        taskId + "-" + reviewed.attempt + "-REVIEW.md",
      );
      const result = await this.#withHeartbeat(run.runId, leaseMs, async () =>
        await producer.run({
          taskId,
          revision: task.revision,
          attempt: reviewed.attempt,
          prompt,
          outputPath,
          outputSchemaPath: path.join(this.#schemasDirectory, "review.schema.json"),
          onProcessStarted: (identity) => {
            this.#options.state.attachOwnedProcess({
              runId: run.runId,
              pid: identity.rootPid,
              observedAt: identity.startedAt,
              ...(identity.executable ? { executable: identity.executable } : {}),
            });
          },
        }),
      );
      const attached = this.#options.state.getRun(run.runId);
      if (!attached || attached.pid === null) {
        throw new Error("producer did not record provider process ownership");
      }
      const failed =
        result.process.timedOut
        || result.process.exitCode !== 0
        || !existsSync(outputPath);
      this.#options.state.finishRun(run.runId, {
        state: result.process.timedOut ? "TIMED_OUT" : failed ? "FAILED" : "COMPLETED",
        exitCode: result.process.exitCode,
        timedOut: result.process.timedOut,
      });
      if (failed) {
        const reason = "review invocation did not produce a valid artifact";
        this.#safeTransition(task, "UNDER_REVIEW", "EXECUTION_FAILED", reason);
        return { kind: "EXECUTION_FAILED", taskId, attempt: reviewed.attempt, reason };
      }
      return {
        kind: "WAIT",
        taskId,
        attempt: reviewed.attempt,
        reason: "review run completed; review awaits reconciliation",
      };
    } catch (error) {
      this.#options.state.finishRun(run.runId, {
        state: "FAILED",
        exitCode: null,
        timedOut: false,
      });
      this.#safeTransition(task, "UNDER_REVIEW", "EXECUTION_FAILED", "review invocation failed");
      throw error;
    }
  }

  #nextAttemptNumber(taskId: string): number {
    const names = this.#deliveryNames(taskId);
    if (names.length === 0) return 1;
    return attemptNumber(attemptFromName(names[0] as string, DELIVERY_NAME)) + 1;
  }

  async #withHeartbeat<T>(runId: string, leaseMs: number, operation: () => Promise<T>): Promise<T> {
    const intervalMs = this.#options.heartbeatIntervalMs ?? Math.min(30_000, Math.max(1, Math.floor(leaseMs / 3)));
    let heartbeatError: Error | null = null;
    const timer = setInterval(() => {
      try {
        this.#options.state.heartbeat(runId, leaseMs);
      } catch (error) {
        heartbeatError = error instanceof Error ? error : new Error(String(error));
      }
    }, intervalMs);
    try {
      const result = await operation();
      if (heartbeatError) throw heartbeatError;
      return result;
    } finally {
      clearInterval(timer);
    }
  }

  /**
   * Applies the final approval-integrity gate immediately before checkpoint.
   * It re-reads both immutable artifacts, binds task/revision/attempt,
   * delivery/review digests, branch/head/baseline, the reviewed source diff and
   * tree digest, and requires the current worktree source inventory to match
   * exactly before creating one sequential Conventional Commit.
   */
  checkpoint(taskId: string): ReconcileAction {
    const task = this.#options.state.getTask(taskId);
    if (!task) throw new Error("unknown task " + taskId);
    if (task.state !== "APPROVED") throw new Error("checkpoint requires APPROVED task state");
    const reviewed = this.#reviewedAttempt(task);
    if (!reviewed || reviewed.deliveryDigest === null) {
      throw new Error("checkpoint requires a recorded delivery artifact");
    }
    const deliveryNames = this.#deliveryNames(taskId);
    if (deliveryNames.length === 0) throw new Error("checkpoint requires a delivery artifact");
    const deliveryArtifact = this.#readArtifact(
      this.#options.deliveriesDirectory,
      deliveryNames[0] as string,
    );
    if (deliveryArtifact.digest !== reviewed.deliveryDigest) {
      throw new Error("delivery digest changed before checkpoint");
    }

    const reviewNames = this.#reviewNames(taskId, reviewed.attempt);
    if (reviewNames.length === 0) throw new Error("checkpoint requires a review artifact");
    const reviewArtifact = this.#readArtifact(
      this.#options.reviewsDirectory,
      reviewNames[0] as string,
    );
    const frontMatter = reviewArtifact.parsed.frontMatter;
    const taskDigest = this.#taskDigest(taskId);
    if (frontMatter.task_sha256 !== taskDigest) {
      throw new Error("task content changed after review");
    }
    const errors: string[] = [];
    if (frontMatter.decision !== "APPROVED") errors.push("review is not APPROVED");
    const validation = validateReview(
      { ...frontMatter, sections: reviewArtifact.parsed.sections },
      {
        taskId,
        revision: task.revision,
        attempt: reviewed.attempt,
        deliverySha256: reviewed.deliveryDigest,
        taskSha256: taskDigest,
      },
    );
    errors.push(...validation.errors);
    if (errors.length > 0) {
      throw new Error("review is not valid at checkpoint: " + errors.join("; "));
    }

    const recordedReview = this.#options.state.getArtifactDigest(
      taskId,
      task.revision,
      reviewed.attempt,
      "review",
    );
    if (recordedReview !== reviewArtifact.digest) {
      throw new Error("review digest changed before checkpoint");
    }

    const git = this.inspectSource();
    if (frontMatter.head_commit !== git.head) throw new Error("head changed after review");
    if (frontMatter.branch !== git.branch) throw new Error("branch changed after review");
    if (frontMatter.source_sha256 !== git.sourceSha256) {
      throw new Error("source content changed after review");
    }
    if (frontMatter.tree_sha256 !== git.inventorySha256) {
      throw new Error("worktree inventory changed after review");
    }

    const approval = createApprovalBinding({
      taskId,
      taskRevision: task.revision,
      attempt: reviewed.attempt,
      deliverySha256: reviewed.deliveryDigest,
      reviewSha256: reviewArtifact.digest,
      taskSha256: taskDigest,
      decision: "APPROVED",
      baselineCommit: String(frontMatter.baseline_commit),
      git,
      approvedAt: String(frontMatter.created_at),
    });
    verifyCheckpointIntegrity({
      approval,
      observed: {
        repoRoot: this.#options.root,
        taskId,
        taskRevision: task.revision,
        attempt: reviewed.attempt,
        deliverySha256: reviewed.deliveryDigest,
        reviewSha256: reviewArtifact.digest,
        taskSha256: taskDigest,
        reviewDecision: "APPROVED",
        git,
      },
    });

    const committed = this.#gitCheckpoint.commit({ taskId, approved: git });

    this.#safeTransition(task, "APPROVED", "CHECKPOINTED", "approval integrity verified");
    return {
      kind: "CHECKPOINTED",
      taskId,
      attempt: reviewed.attempt,
      digest: approval.approval_sha256,
      commit: committed.commit,
    };
  }
}

