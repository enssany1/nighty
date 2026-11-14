import {
  closeSync,
  fsyncSync,
  openSync,
  rmSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from "node:fs";

import { assertControlArtifactPath } from "./bounded-io.ts";

export type ForegroundRunnerOptions = {
  lockPath: string;
  watchDirectories: string[];
  reconcile: () => Promise<unknown>;
  pollIntervalMs?: number;
  onError?: (error: Error) => void;
};

/**
 * Foreground-only orchestration loop. Filesystem events are wakeups, never
 * authority: every wake and every periodic poll runs the same complete
 * reconciliation callback under a single project lock.
 */
export class ForegroundRunner {
  readonly #options: ForegroundRunnerOptions;
  readonly #pollIntervalMs: number;
  #lockDescriptor: number | null = null;
  #watchers: FSWatcher[] = [];
  #pollTimer: NodeJS.Timeout | null = null;
  #drain: Promise<void> | null = null;
  #pending = false;
  #started = false;
  #lastError: Error | null = null;

  constructor(options: ForegroundRunnerOptions) {
    const pollIntervalMs = options.pollIntervalMs ?? 30_000;
    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1) {
      throw new Error("poll interval must be a positive integer");
    }
    if (options.watchDirectories.length === 0) {
      throw new Error("at least one watch directory is required");
    }
    this.#options = options;
    this.#pollIntervalMs = pollIntervalMs;
  }

  get running(): boolean {
    return this.#started;
  }

  async start(): Promise<void> {
    if (this.#started) throw new Error("foreground runner is already started");
    assertControlArtifactPath(this.#options.lockPath);
    try {
      this.#lockDescriptor = openSync(this.#options.lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error("runner lock is already owned: " + this.#options.lockPath);
      }
      throw error;
    }
    try {
      writeFileSync(
        this.#lockDescriptor,
        JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }) + "\n",
        "utf8",
      );
      fsyncSync(this.#lockDescriptor);
      this.#started = true;
      for (const directory of this.#options.watchDirectories) {
        assertControlArtifactPath(directory);
        this.#watchers.push(
          watch(directory, { persistent: true }, () => {
            this.wake();
          }),
        );
      }
      this.#pollTimer = setInterval(() => this.wake(), this.#pollIntervalMs);
      this.wake();
      await this.waitForIdle();
      if (this.#lastError) throw this.#lastError;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  wake(): void {
    if (!this.#started) return;
    this.#pending = true;
    if (this.#drain !== null) return;
    this.#drain = this.#drainLoop().finally(() => {
      this.#drain = null;
      if (this.#pending && this.#started) this.wake();
    });
  }

  async waitForIdle(): Promise<void> {
    while (this.#drain !== null) await this.#drain;
  }

  async stop(): Promise<void> {
    this.#started = false;
    this.#pending = false;
    if (this.#pollTimer !== null) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = null;
    }
    for (const watcher of this.#watchers.splice(0)) watcher.close();
    if (this.#drain !== null) await this.#drain;
    if (this.#lockDescriptor !== null) {
      closeSync(this.#lockDescriptor);
      this.#lockDescriptor = null;
      rmSync(this.#options.lockPath, { force: true });
    }
  }

  async #drainLoop(): Promise<void> {
    while (this.#started && this.#pending) {
      this.#pending = false;
      try {
        await this.#options.reconcile();
      } catch (error) {
        this.#lastError = error instanceof Error ? error : new Error(String(error));
        this.#options.onError?.(this.#lastError);
        this.#pending = false;
      }
    }
  }
}
