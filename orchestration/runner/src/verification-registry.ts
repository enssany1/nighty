import {
  runOwnedProcess,
  type ProcessResult,
} from "./process-supervisor.ts";

type VerificationCommand = {
  executable: string;
  args: string[];
  timeoutMs: number;
  maxOutputBytes: number;
};

export class VerificationRegistry {
  readonly #commands = new Map<string, Readonly<VerificationCommand>>();

  register(id: string, command: VerificationCommand): void {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error("invalid verification command identifier");
    }
    if (this.#commands.has(id)) throw new Error("verification command already registered: " + id);
    this.#commands.set(id, Object.freeze({ ...command, args: [...command.args] }));
  }

  async run(
    id: string,
    cwd: string,
    environment: Record<string, string>,
  ): Promise<ProcessResult> {
    const command = this.#commands.get(id);
    if (!command) throw new Error("verification command is not registered: " + id);
    return await runOwnedProcess({
      executable: command.executable,
      args: [...command.args],
      cwd,
      allowedExecutables: [command.executable],
      timeoutMs: command.timeoutMs,
      maxOutputBytes: command.maxOutputBytes,
      environment,
    });
  }
}
