import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type { StateStore, TaskRecord } from "./state-store.ts";

type ProjectionInput = {
  state: StateStore;
  jsonPath: string;
  markdownPath: string;
  generatedAt?: string;
};

function projectState(tasks: TaskRecord[], active: TaskRecord | undefined): string {
  if (active) return active.state;
  return tasks.length > 0 && tasks.every((task) => task.state === "CHECKPOINTED")
    ? "READY_FOR_ACCEPTANCE"
    : "IDLE";
}

function replaceFile(filePath: string, contents: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = filePath + "." + process.pid + ".tmp";
  const descriptor = openSync(temporary, "wx");
  try {
    writeFileSync(descriptor, contents, { encoding: "utf8" });
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  rmSync(filePath, { force: true });
  renameSync(temporary, filePath);
}

export function writeStateProjections(input: ProjectionInput): void {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const tasks = input.state.listTasks();
  const active = input.state.getActiveTask();
  const projection = {
    schema: "nighty.task-status/v1",
    generatedAt,
    projectState: projectState(tasks, active),
    activeTaskId: active?.taskId ?? null,
    runnerOwner: active ? "foreground-runner" : null,
    tasks: tasks.map((task) => ({
      taskId: task.taskId,
      revision: task.revision,
      state: task.state,
      active: task.active,
      lease: input.state.getLease(task.taskId) ?? null,
    })),
  };
  replaceFile(input.jsonPath, JSON.stringify(projection, null, 2) + "\n");

  const rows = tasks.length === 0
    ? "| _none_ | — | — |"
    : tasks
      .map((task) => `| ${task.taskId} | ${task.revision} | ${task.state} |`)
      .join("\n");
  const markdown = [
    "# Nighty orchestration status",
    "",
    `**Generated:** ${generatedAt}`,
    `**Project state:** ${projection.projectState}`,
    `**Active task:** ${projection.activeTaskId ?? "none"}`,
    "",
    "| Task | Revision | State |",
    "|---|---:|---|",
    rows,
    "",
    "This file is a generated projection. SQLite remains authoritative.",
    "",
  ].join("\n");
  replaceFile(input.markdownPath, markdown);
}
