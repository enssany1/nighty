import path from "node:path";

import { readBoundedJsonFile } from "./bounded-io.ts";

export type JsonSchema = Record<string, unknown>;

const SUPPORTED_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$comment",
  "title",
  "description",
  "default",
  "examples",
  "type",
  "const",
  "enum",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "format",
  "oneOf",
  "anyOf",
  "allOf",
  "not",
  "minProperties",
  "maxProperties",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function pointer(base: string, key: string): string {
  return base + "/" + key.replace(/~/g, "~0").replace(/\//g, "~1");
}

function isSchemaObject(value: unknown): value is JsonSchema {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function assertSupportedSchema(schema: JsonSchema, base = "$"): void {
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) {
      throw new Error("unsupported schema keyword at " + base + ": " + key);
    }
  }
  if (schema.properties !== undefined) {
    if (!isSchemaObject(schema.properties)) {
      throw new Error("unsupported schema shape at " + base + ": properties must be an object");
    }
    for (const [key, value] of Object.entries(schema.properties)) {
      if (!isSchemaObject(value)) {
        throw new Error("unsupported schema shape at " + pointer(base, key));
      }
      assertSupportedSchema(value, pointer(base, key));
    }
  }
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") {
    if (!isSchemaObject(schema.additionalProperties)) {
      throw new Error("unsupported schema shape at " + base + ": additionalProperties");
    }
    assertSupportedSchema(schema.additionalProperties, base + "/additionalProperties");
  }
  if (schema.items !== undefined) {
    if (!isSchemaObject(schema.items)) {
      throw new Error("unsupported schema shape at " + base + ": items must be an object schema");
    }
    assertSupportedSchema(schema.items, base + "/items");
  }
  for (const keyword of ["oneOf", "anyOf", "allOf"] as const) {
    const value = schema[keyword];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error("unsupported schema shape at " + base + ": " + keyword + " must be a non-empty array");
    }
    value.forEach((entry, index) => {
      if (!isSchemaObject(entry)) {
        throw new Error("unsupported schema shape at " + base + "/" + keyword + "/" + index);
      }
      assertSupportedSchema(entry, base + "/" + keyword + "/" + index);
    });
  }
  if (schema.not !== undefined) {
    if (!isSchemaObject(schema.not)) throw new Error("unsupported schema shape at " + base + ": not");
    assertSupportedSchema(schema.not, base + "/not");
  }
}

function typeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      throw new Error("unsupported schema type: " + type);
  }
}

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function validateFormat(value: string, format: string, at: string): string[] {
  if (format === "uuid") {
    return UUID.test(value) ? [] : [at + ": must be a UUID"];
  }
  if (format === "date-time") {
    return DATE_TIME.test(value) && !Number.isNaN(Date.parse(value))
      ? []
      : [at + ": must be an RFC3339 date-time"];
  }
  throw new Error("unsupported schema format: " + format);
}

export function validateAgainstSchema(
  value: unknown,
  schema: JsonSchema,
  base = "$",
): string[] {
  assertSupportedSchema(schema, base);
  const errors: string[] = [];

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.every((entry) => typeof entry === "string")) {
      throw new Error("unsupported schema type at " + base);
    }
    if (!types.some((entry) => typeMatches(value, entry as string))) {
      errors.push(base + ": expected type " + types.join(" or "));
      return errors;
    }
  }
  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    errors.push(base + ": must equal the declared constant");
  }
  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum)) throw new Error("unsupported schema enum at " + base);
    if (!schema.enum.some((entry) => deepEqual(value, entry))) {
      errors.push(base + ": must be one of the declared values");
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < Number(schema.minItems)) {
      errors.push(base + ": must contain at least " + schema.minItems + " items");
    }
    if (schema.maxItems !== undefined && value.length > Number(schema.maxItems)) {
      errors.push(base + ": must contain at most " + schema.maxItems + " items");
    }
    if (schema.uniqueItems === true) {
      const seen = new Set<string>();
      value.forEach((entry, index) => {
        const key = canonical(entry);
        if (seen.has(key)) errors.push(pointer(base, String(index)) + ": must be unique");
        seen.add(key);
      });
    }
    if (schema.items !== undefined && isSchemaObject(schema.items)) {
      value.forEach((entry, index) => {
        errors.push(...validateAgainstSchema(entry, schema.items as JsonSchema, pointer(base, String(index))));
      });
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const required = schema.required;
    if (required !== undefined) {
      if (!Array.isArray(required) || !required.every((entry) => typeof entry === "string")) {
        throw new Error("unsupported schema required at " + base);
      }
      for (const key of required) {
        if (!Object.hasOwn(record, key)) {
          errors.push(base + ": missing required property \"" + key + "\"");
        }
      }
    }
    const properties = isSchemaObject(schema.properties) ? schema.properties : {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (!Object.hasOwn(record, key)) continue;
      if (!isSchemaObject(propertySchema)) throw new Error("unsupported schema shape at " + base);
      errors.push(
        ...validateAgainstSchema(record[key], propertySchema, pointer(base, key)),
      );
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!Object.hasOwn(properties, key)) {
          errors.push(base + ": additional property \"" + key + "\" is not allowed");
        }
      }
    } else if (isSchemaObject(schema.additionalProperties)) {
      for (const [key, entry] of Object.entries(record)) {
        if (Object.hasOwn(properties, key)) continue;
        errors.push(
          ...validateAgainstSchema(entry, schema.additionalProperties, pointer(base, key)),
        );
      }
    }
    if (schema.minProperties !== undefined && Object.keys(record).length < Number(schema.minProperties)) {
      errors.push(base + ": must contain at least " + schema.minProperties + " properties");
    }
    if (schema.maxProperties !== undefined && Object.keys(record).length > Number(schema.maxProperties)) {
      errors.push(base + ": must contain at most " + schema.maxProperties + " properties");
    }
  }

  if (typeof value === "string") {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < Number(schema.minLength)) {
      errors.push(base + ": must be at least " + schema.minLength + " characters");
    }
    if (schema.maxLength !== undefined && length > Number(schema.maxLength)) {
      errors.push(base + ": must be at most " + schema.maxLength + " characters");
    }
    if (schema.pattern !== undefined) {
      if (typeof schema.pattern !== "string") throw new Error("unsupported schema pattern at " + base);
      let pattern: RegExp;
      try {
        pattern = new RegExp(schema.pattern);
      } catch {
        throw new Error("invalid schema pattern at " + base);
      }
      if (!pattern.test(value)) errors.push(base + ": does not match the required pattern");
    }
    if (schema.format !== undefined) {
      if (typeof schema.format !== "string") throw new Error("unsupported schema format at " + base);
      errors.push(...validateFormat(value, schema.format, base));
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < Number(schema.minimum)) {
      errors.push(base + ": must be at least " + schema.minimum);
    }
    if (schema.maximum !== undefined && value > Number(schema.maximum)) {
      errors.push(base + ": must be at most " + schema.maximum);
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter(
      (entry) => isSchemaObject(entry) && validateAgainstSchema(value, entry, base).length === 0,
    ).length;
    if (matches !== 1) errors.push(base + ": must match exactly one allowed schema");
  }
  if (Array.isArray(schema.anyOf)) {
    const matches = schema.anyOf.some(
      (entry) => isSchemaObject(entry) && validateAgainstSchema(value, entry, base).length === 0,
    );
    if (!matches) errors.push(base + ": must match at least one allowed schema");
  }
  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((entry) => {
      if (!isSchemaObject(entry)) throw new Error("unsupported schema shape at " + base);
      errors.push(...validateAgainstSchema(value, entry, base));
    });
  }
  if (isSchemaObject(schema.not) && validateAgainstSchema(value, schema.not, base).length === 0) {
    errors.push(base + ": must not match the excluded schema");
  }

  return errors;
}

export function loadSchemaFile(
  filePath: string,
  options: { maxBytes: number },
): JsonSchema {
  const parsed = readBoundedJsonFile(path.resolve(filePath), {
    maxBytes: options.maxBytes,
    rejectControlArtifacts: true,
    requireObject: true,
  });
  if (!isSchemaObject(parsed)) throw new Error("output schema must be a JSON object");
  assertSupportedSchema(parsed);
  return parsed;
}

export function validateStructuredResult(
  value: unknown,
  schema: JsonSchema,
  label: string,
): void {
  const errors = validateAgainstSchema(value, schema);
  if (errors.length > 0) {
    throw new Error(
      label + " failed local schema validation: " + errors.slice(0, 12).join("; "),
    );
  }
}
