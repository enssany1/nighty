import path from "node:path";
import { BadRequestException } from "@nestjs/common";

export function attachmentRoot(): string {
  return path.resolve(process.env.ATTACHMENTS_PATH?.trim() || path.join(process.cwd(), "data", "attachments"));
}

export function attachmentPath(storageKey: string, temporary = false): string {
  if (!/^[a-f0-9]{64}$/.test(storageKey)) throw new BadRequestException("Invalid owned storage key");
  return path.join(attachmentRoot(), `${storageKey}${temporary ? ".tmp" : ""}`);
}
