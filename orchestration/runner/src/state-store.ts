import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { SecretRedactor } from "./redaction.ts";

export type TaskState =
  | "PLANNED"
  | "READY_FOR_DEVELOPMENT"
  | "IN_DEVELOPMENT"
  | "DELIVERED"
  | "UNDER_REVIEW"
  | "CHANGES_REQUIRED"
  | "READY_FOR_CORRECTION"
  | "EXECUTION_FAILED"
  | "INVALID_REPORT"
  | "APPROVED"
  | "CHECKPOINTED"
  | "HUMAN_REVIEW"
  | "BLOCKED";

export type RunRole = "developer" | "reviewer";

export type RunState = "RUNNING" | "COMPLETED" | "FAILED" | "TIMED_OUT" | "SUPERSEDED";

export type TaskRecord = {
  taskId: string;
  revision: number;
  state: TaskState;
  active: boolean;
};

export type AttemptRecord = {
  taskId: string;
  revision: number;
  attempt: string;
  createdAt: string;
};

export type RunRecord = {
  runId: string;
  taskId: string;
  revision: number;
  attempt: string;
  role: RunRole;
  pid: number | null;
  state: RunState;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  timedOut: boolean;
  processStartedAt: string | null;
  processExecutable: string | null;
};

export type LeaseRecord = {
  runId: string;
  taskId: string;
  revision: number;
  attempt: string;
  role: RunRole;
  pid: number | null;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
  expired: boolean;
  processStartedAt: string | null;
  processExecutable: string | null;
};

export type EventRecord = {
  eventType: string;
  fromState: TaskState | null;
  toState: TaskState | null;
  revision: number | null;
  runId: string | null;
  reason: string | null;
};

type TaskRow = {
  task_id: string;
  revision: number;
  state: TaskState;
  active: number;
};

type RunRow = {
  run_id: string;
  task_id: string;
  revision: number;
  attempt: string;
  role: RunRole;
  pid: number | null;
  state: RunState;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  timed_out: number;
  process_started_at: string | null;
  process_executable: string | null;
};

type LeaseRow = {
  run_id: string;
  task_id: string;
  revision: number;
  attempt: string;
  role: RunRole;
  pid: number | null;
  acquired_at: string;
  heartbeat_at: string;
  expires_at: string;
  process_started_at: string | null;
  process_executable: string | null;
};

const ACTIVE_STATES = new Set<TaskState>([
  "IN_DEVELOPMENT",
  "DELIVERED",
  "UNDER_REVIEW",
  "CHANGES_REQUIRED",
  "READY_FOR_CORRECTION",
  "INVALID_REPORT",
  "APPROVED",
  "CHECKPOINTED",
  "HUMAN_REVIEW",
]);

const ALLOWED: Record<TaskState, TaskState[]> = {
  PLANNED: ["READY_FOR_DEVELOPMENT", "BLOCKED"],
  READY_FOR_DEVELOPMENT: ["IN_DEVELOPMENT", "BLOCKED"],
  IN_DEVELOPMENT: ["DELIVERED", "EXECUTION_FAILED", "INVALID_REPORT", "HUMAN_REVIEW", "BLOCKED"],
  DELIVERED: ["UNDER_REVIEW", "INVALID_REPORT", "HUMAN_REVIEW", "BLOCKED"],
  UNDER_REVIEW: ["APPROVED", "CHANGES_REQUIRED", "EXECUTION_FAILED", "INVALID_REPORT", "HUMAN_REVIEW", "BLOCKED"],
  CHANGES_REQUIRED: ["READY_FOR_CORRECTION", "HUMAN_REVIEW", "BLOCKED"],
  READY_FOR_CORRECTION: ["IN_DEVELOPMENT", "HUMAN_REVIEW", "BLOCKED"],
  EXECUTION_FAILED: ["DELIVERED", "READY_FOR_DEVELOPMENT", "READY_FOR_CORRECTION", "BLOCKED"],
  INVALID_REPORT: ["IN_DEVELOPMENT", "UNDER_REVIEW", "HUMAN_REVIEW", "BLOCKED"],
  APPROVED: ["CHECKPOINTED", "HUMAN_REVIEW", "BLOCKED"],
  CHECKPOINTED: [],
  HUMAN_REVIEW: ["READY_FOR_CORRECTION", "READY_FOR_DEVELOPMENT", "BLOCKED"],
  BLOCKED: [],
};

const REVISABLE_STATES = new Set<TaskState>([
  "PLANNED",
  "HUMAN_REVIEW",
  "CHANGES_REQUIRED",
  "READY_FOR_CORRECTION",
  "BLOCKED",
  "CHECKPOINTED",
]);

const RELEASEABLE_STATES = new Set<TaskState>(["CHECKPOINTED"]);

function nowIso(): string {
  return new Date().toISOString();
}

function runRowToRecord(row: RunRow): RunRecord {
  return {
    runId: row.run_id,
    taskId: row.task_id,
    revision: row.revision,
    attempt: row.attempt,
    role: row.role,
    pid: row.pid,
    state: row.state,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    exitCode: row.exit_code,
    timedOut: row.timed_out === 1,
    processStartedAt: row.process_started_at,
    processExecutable: row.process_executable,
  };
}

export class StateStore {
  readonly #database: DatabaseSync;
  readonly #redactor: SecretRedactor;

  constructor(filename: string, options: { redactor?: SecretRedactor } = {}) {
    this.#database = new DatabaseSync(filename);
    this.#redactor = options.redactor ?? new SecretRedactor([]);
    try {
      this.#database.exec(
      "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
    );
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL,
        state TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_task ON tasks(active) WHERE active = 1;
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_key TEXT UNIQUE,
        task_id TEXT NOT NULL,
        revision INTEGER,
        run_id TEXT,
        event_type TEXT NOT NULL,
        attempt TEXT,
        artifact_type TEXT,
        artifact_digest TEXT,
        from_state TEXT,
        to_state TEXT,
        reason TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(task_id)
      );
      CREATE TABLE IF NOT EXISTS attempts (
        task_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        attempt TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (task_id, revision, attempt),
        FOREIGN KEY (task_id) REFERENCES tasks(task_id)
      );
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        attempt TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('developer', 'reviewer')),
        pid INTEGER,
        state TEXT NOT NULL CHECK (state IN ('RUNNING', 'COMPLETED', 'FAILED', 'TIMED_OUT', 'SUPERSEDED')),
        started_at TEXT NOT NULL,
        ended_at TEXT,
        exit_code INTEGER,
        timed_out INTEGER,
        FOREIGN KEY (task_id) REFERENCES tasks(task_id)
      );
      CREATE TABLE IF NOT EXISTS leases (
        run_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        attempt TEXT NOT NULL,
        role TEXT NOT NULL,
        pid INTEGER,
        acquired_at TEXT NOT NULL,
        heartbeat_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        released_at TEXT,
        FOREIGN KEY (run_id) REFERENCES runs(run_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_live_lease ON leases(task_id) WHERE released_at IS NULL;
    `);
    const eventColumns = this.#database
      .prepare("PRAGMA table_info(events)")
      .all() as Array<{ name: string }>;
    if (!eventColumns.some((column) => column.name === "revision")) {
      this.#database.exec("ALTER TABLE events ADD COLUMN revision INTEGER");
    }
    if (!eventColumns.some((column) => column.name === "run_id")) {
      this.#database.exec("ALTER TABLE events ADD COLUMN run_id TEXT");
    }
    const runColumns = this.#database
      .prepare("PRAGMA table_info(runs)")
      .all() as Array<{ name: string }>;
    if (!runColumns.some((column) => column.name === "process_started_at")) {
      this.#database.exec("ALTER TABLE runs ADD COLUMN process_started_at TEXT");
    }
    if (!runColumns.some((column) => column.name === "process_executable")) {
      this.#database.exec("ALTER TABLE runs ADD COLUMN process_executable TEXT");
    }
    const leaseColumns = this.#database
      .prepare("PRAGMA table_info(leases)")
      .all() as Array<{ name: string }>;
    if (!leaseColumns.some((column) => column.name === "process_started_at")) {
      this.#database.exec("ALTER TABLE leases ADD COLUMN process_started_at TEXT");
    }
      if (!leaseColumns.some((column) => column.name === "process_executable")) {
        this.#database.exec("ALTER TABLE leases ADD COLUMN process_executable TEXT");
      }
    } catch (error) {
      this.#database.close();
      throw error;
    }
  }

  close(): void {
    this.#database.close();
  }

  #insertEvent(input: {
    eventKey?: string | null;
    taskId: string;
    revision: number;
    runId?: string | null;
    eventType: string;
    fromState?: TaskState | null;
    toState?: TaskState | null;
    attempt?: string | null;
    artifactType?: string | null;
    artifactDigest?: string | null;
    reason: string;
  }): void {
    this.#database
      .prepare(
        `INSERT INTO events(event_key, task_id, revision, run_id, event_type, attempt, artifact_type, artifact_digest, from_state, to_state, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.eventKey ?? null,
        input.taskId,
        input.revision,
        input.runId ?? null,
        input.eventType,
        input.attempt ?? null,
        input.artifactType ?? null,
        input.artifactDigest ?? null,
        input.fromState ?? null,
        input.toState ?? null,
        this.#redactor.redact(input.reason),
        nowIso(),
      );
  }

  #taskRow(taskId: string): TaskRow | undefined {
    return this.#database
      .prepare("SELECT task_id, revision, state, active FROM tasks WHERE task_id = ?")
      .get(taskId) as TaskRow | undefined;
  }

  createTask(taskId: string, revision: number): void {
    if (!/^TASK-[0-9]{3}$/.test(taskId)) throw new Error("invalid task identifier");
    if (!Number.isInteger(revision) || revision < 1) throw new Error("invalid task revision");
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database
        .prepare("INSERT INTO tasks(task_id, revision, state, active, updated_at) VALUES (?, ?, 'PLANNED', 0, ?)")
        .run(taskId, revision, nowIso());
      this.#insertEvent({
        eventKey: "task-created:" + taskId + ":r" + revision,
        taskId,
        revision,
        eventType: "TASK_CREATED",
        toState: "PLANNED",
        reason: "created",
      });
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  getTask(taskId: string): TaskRecord | undefined {
    const row = this.#taskRow(taskId);
    return row
      ? { taskId: row.task_id, revision: row.revision, state: row.state, active: row.active === 1 }
      : undefined;
  }

  getActiveTask(): TaskRecord | undefined {
    const row = this.#database
      .prepare("SELECT task_id, revision, state, active FROM tasks WHERE active = 1")
      .get() as TaskRow | undefined;
    return row
      ? { taskId: row.task_id, revision: row.revision, state: row.state, active: true }
      : undefined;
  }

  listTasks(): TaskRecord[] {
    const rows = this.#database
      .prepare("SELECT task_id, revision, state, active FROM tasks ORDER BY task_id")
      .all() as TaskRow[];
    return rows.map((row) => ({
      taskId: row.task_id,
      revision: row.revision,
      state: row.state,
      active: row.active === 1,
    }));
  }

  transition(
    taskId: string,
    expected: TaskState,
    next: TaskState,
    reason: string,
    identity: { expectedRevision?: number } = {},
  ): void {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.#taskRow(taskId);
      if (!current) throw new Error("unknown task " + taskId);
      if (identity.expectedRevision !== undefined && current.revision !== identity.expectedRevision) {
        throw new Error(
          "task revision mismatch: expected " + identity.expectedRevision + " but found " + current.revision,
        );
      }
      if (current.state !== expected) {
        throw new Error("expected " + expected + " but found " + current.state);
      }
      if (!ALLOWED[expected].includes(next)) {
        throw new Error("illegal transition " + expected + " -> " + next);
      }
      if (ACTIVE_STATES.has(next) && !current.active) {
        const owner = this.#database
          .prepare("SELECT task_id FROM tasks WHERE active = 1 AND task_id <> ?")
          .get(taskId) as { task_id: string } | undefined;
        if (owner) throw new Error("active task " + owner.task_id + " already owns the workflow");
      }
      const active = ACTIVE_STATES.has(next) ? 1 : 0;
      this.#database
        .prepare("UPDATE tasks SET state = ?, active = ?, updated_at = ? WHERE task_id = ?")
        .run(next, active, nowIso(), taskId);
      this.#insertEvent({
        taskId,
        revision: current.revision,
        eventType: "STATE_TRANSITION",
        fromState: expected,
        toState: next,
        reason,
      });
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * Ends ownership only after a checkpoint has been verified. This is an
   * explicit, audited act; state transitions never release CHECKPOINTED.
   */
  releaseOwnership(taskId: string, expectedState: TaskState, reason: string): void {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.#taskRow(taskId);
      if (!current) throw new Error("unknown task " + taskId);
      if (current.state !== expectedState) {
        throw new Error("expected " + expectedState + " but found " + current.state);
      }
      if (current.active !== 1) throw new Error("task does not own the workflow: " + taskId);
      if (!RELEASEABLE_STATES.has(expectedState)) {
        throw new Error("ownership cannot be released from state " + expectedState);
      }
      this.#database
        .prepare("UPDATE tasks SET active = 0, updated_at = ? WHERE task_id = ?")
        .run(nowIso(), taskId);
      this.#insertEvent({
        taskId,
        revision: current.revision,
        eventType: "OWNERSHIP_RELEASED",
        fromState: expectedState,
        toState: expectedState,
        reason,
      });
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  reviseTask(taskId: string, expectedRevision: number, nextRevision: number, reason: string): void {
    if (!Number.isInteger(nextRevision) || nextRevision <= expectedRevision) {
      throw new Error("task revision must increase");
    }
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.#taskRow(taskId);
      if (!current) throw new Error("unknown task " + taskId);
      if (current.revision !== expectedRevision) {
        throw new Error(
          "task revision mismatch: expected " + expectedRevision + " but found " + current.revision,
        );
      }
      if (!REVISABLE_STATES.has(current.state)) {
        throw new Error("task state " + current.state + " does not permit a revision change");
      }
      this.#database
        .prepare("UPDATE tasks SET revision = ?, updated_at = ? WHERE task_id = ?")
        .run(nextRevision, nowIso(), taskId);
      this.#insertEvent({
        taskId,
        revision: nextRevision,
        eventType: "TASK_REVISED",
        fromState: current.state,
        toState: current.state,
        reason,
      });
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  beginAttempt(taskId: string, revision: number, attempt: string): "created" | "existing" {
    if (!/^A[0-9]{2}$/.test(attempt)) throw new Error("invalid attempt identifier");
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.#taskRow(taskId);
      if (!current) throw new Error("unknown task " + taskId);
      if (current.revision !== revision) {
        throw new Error("task revision mismatch: expected " + revision + " but found " + current.revision);
      }
      const result = this.#database
        .prepare("INSERT OR IGNORE INTO attempts(task_id, revision, attempt, created_at) VALUES (?, ?, ?, ?)")
        .run(taskId, revision, attempt, nowIso());
      this.#database.exec("COMMIT");
      return result.changes === 1 ? "created" : "existing";
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  beginRun(input: {
    taskId: string;
    revision: number;
    attempt: string;
    role: RunRole;
    pid: number | null;
    leaseMs: number;
  }): RunRecord {
    if (input.role !== "developer" && input.role !== "reviewer") {
      throw new Error("invalid run role");
    }
    if (!Number.isInteger(input.leaseMs) || input.leaseMs < 1) {
      throw new Error("lease duration must be a positive integer");
    }
    if (input.pid !== null && (!Number.isInteger(input.pid) || input.pid < 1)) {
      throw new Error("invalid owned process pid");
    }
    const now = nowIso();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.#taskRow(input.taskId);
      if (!current) throw new Error("unknown task " + input.taskId);
      if (current.revision !== input.revision) {
        throw new Error(
          "task revision mismatch: expected " + input.revision + " but found " + current.revision,
        );
      }
      const attempt = this.#database
        .prepare("SELECT attempt FROM attempts WHERE task_id = ? AND revision = ? AND attempt = ?")
        .get(input.taskId, input.revision, input.attempt) as { attempt: string } | undefined;
      if (!attempt) throw new Error("attempt is not registered: " + input.attempt);

      const open = this.#database
        .prepare("SELECT * FROM leases WHERE task_id = ? AND released_at IS NULL")
        .get(input.taskId) as LeaseRow | undefined;
      if (open) {
        if (Date.parse(open.expires_at) > Date.now()) {
          throw new Error("live lease already owned by run " + open.run_id);
        }
        this.#database
          .prepare("UPDATE leases SET released_at = ? WHERE run_id = ?")
          .run(now, open.run_id);
        this.#database
          .prepare(
            "UPDATE runs SET state = 'SUPERSEDED', ended_at = ? WHERE run_id = ? AND state = 'RUNNING'",
          )
          .run(now, open.run_id);
        this.#insertEvent({
          taskId: input.taskId,
          revision: input.revision,
          runId: open.run_id,
          eventType: "LEASE_SUPERSEDED",
          reason: "lease expired before a new run acquired ownership",
        });
      }

      const runId = randomUUID();
      const expiresAt = new Date(Date.now() + input.leaseMs).toISOString();
      this.#database
        .prepare(
          `INSERT INTO runs(run_id, task_id, revision, attempt, role, pid, state, started_at, ended_at, exit_code, timed_out)
           VALUES (?, ?, ?, ?, ?, ?, 'RUNNING', ?, NULL, NULL, 0)`,
        )
        .run(runId, input.taskId, input.revision, input.attempt, input.role, input.pid, now);
      this.#database
        .prepare(
          `INSERT INTO leases(run_id, task_id, revision, attempt, role, pid, acquired_at, heartbeat_at, expires_at, released_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          runId,
          input.taskId,
          input.revision,
          input.attempt,
          input.role,
          input.pid,
          now,
          now,
          expiresAt,
        );
      this.#database.exec("COMMIT");
      return {
        runId,
        taskId: input.taskId,
        revision: input.revision,
        attempt: input.attempt,
        role: input.role,
        pid: input.pid,
        state: "RUNNING",
        startedAt: now,
        endedAt: null,
        exitCode: null,
        timedOut: false,
        processStartedAt: null,
        processExecutable: null,
      };
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  attachOwnedProcess(input: {
    runId: string;
    pid: number;
    observedAt?: string;
    executable?: string;
  }): void {
    if (!Number.isInteger(input.pid) || input.pid < 1) {
      throw new Error("invalid provider process pid");
    }
    const now = nowIso();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const run = this.#database
        .prepare("SELECT * FROM runs WHERE run_id = ?")
        .get(input.runId) as RunRow | undefined;
      if (!run) throw new Error("unknown run " + input.runId);
      if (run.state !== "RUNNING") {
        throw new Error("run " + input.runId + " is not running");
      }
      const lease = this.#database
        .prepare("SELECT * FROM leases WHERE run_id = ? AND released_at IS NULL")
        .get(input.runId) as LeaseRow | undefined;
      if (!lease) throw new Error("run " + input.runId + " has no live lease");
      if (Date.parse(lease.expires_at) <= Date.now()) {
        throw new Error("run " + input.runId + " lease has expired");
      }
      if (run.pid !== null) {
        if (run.pid === input.pid) {
          this.#database.exec("COMMIT");
          return;
        }
        throw new Error("run already owns provider process " + run.pid);
      }
      const processStartedAt = input.observedAt ?? now;
      const processExecutable = input.executable ?? null;
      this.#database
        .prepare("UPDATE runs SET pid = ?, process_started_at = ?, process_executable = ? WHERE run_id = ?")
        .run(input.pid, processStartedAt, processExecutable, input.runId);
      this.#database
        .prepare("UPDATE leases SET pid = ?, heartbeat_at = ?, process_started_at = ?, process_executable = ? WHERE run_id = ? AND released_at IS NULL")
        .run(input.pid, now, processStartedAt, processExecutable, input.runId);
      this.#insertEvent({
        taskId: run.task_id,
        revision: run.revision,
        runId: input.runId,
        eventType: "OWNED_PROCESS_ATTACHED",
        reason: "provider process started",
      });
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  heartbeat(runId: string, leaseMs: number): LeaseRecord {
    if (!Number.isInteger(leaseMs) || leaseMs < 1) {
      throw new Error("lease duration must be a positive integer");
    }
    const now = nowIso();
    const expiresAt = new Date(Date.now() + leaseMs).toISOString();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const lease = this.#database
        .prepare("SELECT * FROM leases WHERE run_id = ? AND released_at IS NULL")
        .get(runId) as LeaseRow | undefined;
      if (!lease) throw new Error("no live lease for run " + runId);
      this.#database
        .prepare("UPDATE leases SET heartbeat_at = ?, expires_at = ? WHERE run_id = ?")
        .run(now, expiresAt, runId);
      this.#database.exec("COMMIT");
      return {
        runId: lease.run_id,
        taskId: lease.task_id,
        revision: lease.revision,
        attempt: lease.attempt,
        role: lease.role,
        pid: lease.pid,
        acquiredAt: lease.acquired_at,
        heartbeatAt: now,
        expiresAt,
        expired: false,
        processStartedAt: lease.process_started_at,
        processExecutable: lease.process_executable,
      };
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  finishRun(
    runId: string,
    outcome: { state: "COMPLETED" | "FAILED" | "TIMED_OUT"; exitCode: number | null; timedOut: boolean },
  ): void {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const run = this.#database
        .prepare("SELECT * FROM runs WHERE run_id = ?")
        .get(runId) as RunRow | undefined;
      if (!run) throw new Error("unknown run " + runId);
      if (run.state !== "RUNNING") {
        if (run.state === outcome.state) {
          this.#database.exec("COMMIT");
          return;
        }
        throw new Error("run " + runId + " is already " + run.state);
      }
      const now = nowIso();
      this.#database
        .prepare("UPDATE runs SET state = ?, ended_at = ?, exit_code = ?, timed_out = ? WHERE run_id = ?")
        .run(outcome.state, now, outcome.exitCode, outcome.timedOut ? 1 : 0, runId);
      this.#database
        .prepare("UPDATE leases SET released_at = ? WHERE run_id = ? AND released_at IS NULL")
        .run(now, runId);
      this.#insertEvent({
        taskId: run.task_id,
        revision: run.revision,
        runId,
        eventType: "RUN_FINISHED",
        fromState: null,
        toState: null,
        reason: outcome.state,
      });
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  getRun(runId: string): RunRecord | undefined {
    const row = this.#database.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId) as
      | RunRow
      | undefined;
    return row ? runRowToRecord(row) : undefined;
  }

  listRuns(taskId: string): RunRecord[] {
    const rows = this.#database
      .prepare("SELECT * FROM runs WHERE task_id = ? ORDER BY started_at, rowid")
      .all(taskId) as RunRow[];
    return rows.map(runRowToRecord);
  }

  getLease(taskId: string): LeaseRecord | undefined {
    const row = this.#database
      .prepare("SELECT * FROM leases WHERE task_id = ? AND released_at IS NULL")
      .get(taskId) as LeaseRow | undefined;
    if (!row) return undefined;
    return {
      runId: row.run_id,
      taskId: row.task_id,
      revision: row.revision,
      attempt: row.attempt,
      role: row.role,
      pid: row.pid,
      acquiredAt: row.acquired_at,
      heartbeatAt: row.heartbeat_at,
      expiresAt: row.expires_at,
      expired: Date.parse(row.expires_at) <= Date.now(),
      processStartedAt: row.process_started_at,
      processExecutable: row.process_executable,
    };
  }

  recordCleanupFailure(runId: string, reason: string): void {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const run = this.#database
        .prepare("SELECT * FROM runs WHERE run_id = ?")
        .get(runId) as RunRow | undefined;
      if (!run) throw new Error("unknown run " + runId);
      if (run.state !== "RUNNING") throw new Error("cleanup retry requires a running run");
      this.#insertEvent({
        taskId: run.task_id,
        revision: run.revision,
        runId,
        eventType: "CLEANUP_RETRY_REQUIRED",
        reason,
      });
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  recordArtifact(
    taskId: string,
    attempt: string,
    artifactType: string,
    digest: string,
    options: { revision?: number } = {},
  ): "recorded" | "duplicate" {
    let eventKey = "";
    let revision = options.revision ?? 0;
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.#taskRow(taskId);
      if (!current) throw new Error("unknown task " + taskId);
      revision = options.revision ?? current.revision;
      if (revision !== current.revision) {
        throw new Error("task revision mismatch: expected " + revision + " but found " + current.revision);
      }
      eventKey = [taskId, "r" + revision, attempt, artifactType].join(":");
      const existing = this.#database
        .prepare("SELECT artifact_digest FROM events WHERE event_key = ?")
        .get(eventKey) as { artifact_digest: string } | undefined;
      if (existing) {
        if (existing.artifact_digest === digest) {
          this.#database.exec("COMMIT");
          return "duplicate";
        }
        throw new Error("conflicting artifact digest for " + eventKey);
      }
      this.#insertEvent({
        eventKey,
        taskId,
        revision,
        eventType: "ARTIFACT_RECORDED",
        attempt,
        artifactType,
        artifactDigest: digest,
        reason: "validated",
      });
      this.#database.exec("COMMIT");
      return "recorded";
    } catch (error) {
      try {
        this.#database.exec("ROLLBACK");
      } catch {
        // A committed duplicate path already released the transaction.
      }
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed: events.event_key")) {
        const row = this.#database
          .prepare("SELECT artifact_digest FROM events WHERE event_key = ?")
          .get(eventKey) as { artifact_digest: string } | undefined;
        if (row?.artifact_digest === digest) return "duplicate";
      }
      throw error;
    }
  }

  getArtifactDigest(
    taskId: string,
    revision: number,
    attempt: string,
    artifactType: string,
  ): string | null {
    const eventKey = [taskId, "r" + revision, attempt, artifactType].join(":");
    const row = this.#database
      .prepare("SELECT artifact_digest FROM events WHERE event_key = ?")
      .get(eventKey) as { artifact_digest: string | null } | undefined;
    return row?.artifact_digest ?? null;
  }

  listEvents(): EventRecord[] {
    const rows = this.#database
      .prepare("SELECT event_type, from_state, to_state, revision, run_id, reason FROM events ORDER BY id")
      .all() as Array<{
      event_type: string;
      from_state: TaskState | null;
      to_state: TaskState | null;
      revision: number | null;
      run_id: string | null;
      reason: string | null;
    }>;
    return rows.map((row) => ({
      eventType: row.event_type,
      fromState: row.from_state,
      toState: row.to_state,
      revision: row.revision,
      runId: row.run_id,
      reason: row.reason,
    }));
  }
}

/** Opens an initialized authority store without silently creating a replacement. */
export function openExistingStateStore(filePath: string): StateStore {
  if (!existsSync(filePath)) {
    throw new Error("authoritative state database is missing; recovery requires audit replay and human approval");
  }
  return new StateStore(filePath);
}
