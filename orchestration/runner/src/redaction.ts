export const REDACTED = "[REDACTED]";

const MIN_SECRET_LENGTH = 8;

/**
 * Holds the explicit credential value(s) supplied to the runner and removes
 * every textual representation of them before output is returned or persisted.
 * Values are never logged, rendered, or included in errors.
 */
export class SecretRedactor {
  readonly #needles: string[] = [];

  constructor(values: Iterable<string | null | undefined> = []) {
    for (const value of values) this.add(value);
  }

  get isEmpty(): boolean {
    return this.#needles.length === 0;
  }

  add(value: string | null | undefined): void {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed.length < MIN_SECRET_LENGTH) return;
    const variants = new Set<string>([
      value,
      trimmed,
      JSON.stringify(value).slice(1, -1),
      encodeURIComponent(value),
      encodeURIComponent(trimmed),
    ]);
    for (const variant of variants) {
      if (variant.length < MIN_SECRET_LENGTH) continue;
      if (!this.#needles.includes(variant)) this.#needles.push(variant);
    }
    this.#needles.sort((left, right) => right.length - left.length);
  }

  redact(text: string): string {
    let result = text;
    for (const needle of this.#needles) {
      if (needle.length === 0) continue;
      result = result.split(needle).join(REDACTED);
    }
    return result;
  }

  assertAbsent(text: string, label: string): void {
    for (const needle of this.#needles) {
      if (text.includes(needle)) {
        throw new Error(label + " still contains the explicit credential value");
      }
    }
  }
}

export function redactDeep<T>(value: T, redactor: SecretRedactor): T {
  if (typeof value === "string") return redactor.redact(value) as T;
  if (Array.isArray(value)) return value.map((entry) => redactDeep(entry, redactor)) as T;
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[redactor.redact(key)] = redactDeep(entry, redactor);
    }
    return result as T;
  }
  return value;
}
