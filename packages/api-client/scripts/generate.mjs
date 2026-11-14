import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "openapi.json");
const outputPath = path.join(root, "src", "generated.ts");
const document = JSON.parse(await readFile(sourcePath, "utf8"));
const schemas = document.components?.schemas ?? {};

function typeOf(schema) {
  if (!schema || typeof schema !== "object") return "unknown";
  if (typeof schema.$ref === "string") {
    const name = schema.$ref.split("/").at(-1);
    return `components["schemas"][${JSON.stringify(name)}]`;
  }
  if (Array.isArray(schema.enum)) return schema.enum.map((item) => JSON.stringify(item)).join(" | ");
  if (schema.type === "array") return `Array<${typeOf(schema.items)}>`;
  if (schema.type === "integer" || schema.type === "number") return "number";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "string") return "string";
  if (schema.type === "object" || schema.properties) {
    if (!schema.properties && schema.additionalProperties) return "Record<string, unknown>";
    const required = new Set(schema.required ?? []);
    const fields = Object.entries(schema.properties ?? {}).map(([name, value]) =>
      `      ${JSON.stringify(name)}${required.has(name) ? "" : "?"}: ${typeOf(value)};`
    );
    return `{\n${fields.join("\n")}\n    }`;
  }
  return "unknown";
}

const lines = [
  "/* Generated from openapi.json. Do not edit by hand. */",
  "export interface components {",
  "  schemas: {",
];
for (const name of Object.keys(schemas).sort()) {
  lines.push(`    ${JSON.stringify(name)}: ${typeOf(schemas[name])};`);
}
lines.push("  };", "}", "");
lines.push("export interface paths {");
for (const [route, pathItem] of Object.entries(document.paths ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`  ${JSON.stringify(route)}: {`);
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    const operation = pathItem?.[method];
    if (!operation) continue;
    const requestSchema = operation.requestBody?.content?.["application/json"]?.schema;
    const success = Object.entries(operation.responses ?? {}).find(([status]) => /^2/.test(status))?.[1];
    const responseSchema = success?.content?.["application/json"]?.schema;
    lines.push(`    ${method}: {`);
    lines.push(`      operationId: ${JSON.stringify(operation.operationId ?? "")};`);
    lines.push(`      request: ${typeOf(requestSchema)};`);
    lines.push(`      response: ${typeOf(responseSchema)};`);
    lines.push("    };");
  }
  lines.push("  };");
}
lines.push("}", "");
for (const name of Object.keys(schemas).sort()) {
  lines.push(`export type ${name} = components["schemas"][${JSON.stringify(name)}];`);
}
lines.push("");
const generated = lines.join("\n");

if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== generated) {
    console.error("Generated API types are stale. Run npm run api:generate.");
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, generated, "utf8");
  console.log(`Wrote ${outputPath}`);
}
