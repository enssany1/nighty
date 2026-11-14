import { DatabaseSync } from "node:sqlite";

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
  | "BLOCKED";

type TaskRow = {
  task_id: string;
  revision: number;
  state: TaskState;
  active: number;
};

type EventRow = {
  event_type: string;
  from_state: TaskState | null;
  to_state: TaskState | null;
};

const ACTIVE_STATES = new Set<TaskState>([
  "IN_DEVELOPMENT",
  "DELIVERED",
  "UNDER_REVIEW",
  "CHANGES_REQUIRED",
  "READY_FOR_CORRECTION",
  "INVALID_REPORT",
]);

const ALLOWED: Record<TaskState, TaskState[]> = {
  PLANNED: ["READY_FOR_DEVELOPMENT", "BLOCKED"],
  READY_FOR_DEVELOPMENT: ["IN_DEVELOPMENT", "BLOCKED"],
  IN_DEVELOPMENT: ["DELIVERED", "EXECUTION_FAILED", "INVALID_REPORT", "BLOCKED"],
  DELIVERED: ["UNDER_REVIEW", "INVALID_REPORT", "BLOCKED"],
  UNDER_REVIEW: ["APPROVED", "CHANGES_REQUIRED", "EXECUTION_FAILED", "BLOCKED"],
  CHANGES_REQUIRED: ["READY_FOR_CORRECTION", "BLOCKED"],
  READY_FOR_CORRECTION: ["IN_DEVELOPMENT", "BLOCKED"],
  EXECUTION_FAILED: ["READY_FOR_DEVELOPMENT", "READY_FOR_CORRECTION", "BLOCKED"],
  INVALID_REPORT: ["IN_DEVELOPMENT", "UNDER_REVIEW", "BLOCKED"],
  APPROVED: ["CHECKPOINTED", "BLOCKED"],
  CHECKPOINTED: [],
  BLOCKED: [],
};

export class StateStore {
  readonly #database: DatabaseSync;

  constructor(filename: string) {
    this.#database = new DatabaseSync(filename);
    this.#database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
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
    `);
  }

  close(): void {
    this.#database.close();
  }

  createTask(taskId: string, revision: number): void {
    const now = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database
        .prepare("INSERT INTO tasks(task_id, revision, state, active, updated_at) VALUES (?, ?, 'PLANNED', 0, ?)")
        .run(taskId, revision, now);
      this.#database
        .prepare("INSERT INTO events(event_key, task_id, event_type, to_state, reason, created_at) VALUES (?, ?, 'TASK_CREATED', 'PLANNED', 'created', ?)")
        .run("task-created:" + taskId + ":r" + revision, taskId, now);
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  getTask(taskId: string): { taskId: string; revision: number; state: TaskState; active: boolean } | undefined {
    const row = this.#database
      .prepare("SELECT task_id, revision, state, active FROM tasks WHERE task_id = ?")
      .get(taskId) as TaskRow | undefined;
    return row
      ? { taskId: row.task_id, revision: row.revision, state: row.state, active: row.active === 1 }
      : undefined;
  }

  transition(taskId: string, expected: TaskState, next: TaskState, reason: string): void {
    const now = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.getTask(taskId);
      if (!current) throw new Error("unknown task " + taskId);
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
        .run(next, active, now, taskId);
      this.#database
        .prepare("INSERT INTO events(task_id, event_type, from_state, to_state, reason, created_at) VALUES (?, 'STATE_TRANSITION', ?, ?, ?, ?)")
        .run(taskId, expected, next, reason, now);
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  recordArtifact(taskId: string, attempt: string, artifactType: string, digest: string): "recorded" | "duplicate" {
    const eventKey = [taskId, attempt, artifactType].join(":");
    const existing = this.#database
      .prepare("SELECT artifact_digest FROM events WHERE event_key = ?")
      .get(eventKey) as { artifact_digest: string } | undefined;
    if (existing) {
      if (existing.artifact_digest === digest) return "duplicate";
      throw new Error("conflicting artifact digest for " + eventKey);
    }
    this.#database
      .prepare("INSERT INTO events(event_key, task_id, event_type, attempt, artifact_type, artifact_digest, reason, created_at) VALUES (?, ?, 'ARTIFACT_RECORDED', ?, ?, ?, 'validated', ?)")
      .run(eventKey, taskId, attempt, artifactType, digest, new Date().toISOString());
    return "recorded";
  }

  listEvents(): Array<{ eventType: string; fromState: TaskState | null; toState: TaskState | null }> {
    const rows = this.#database
      .prepare("SELECT event_type, from_state, to_state FROM events ORDER BY id")
      .all() as EventRow[];
    return rows.map((row) => ({
      eventType: row.event_type,
      fromState: row.from_state,
      toState: row.to_state,
    }));
  }
}
