import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createOpenApiDocument } from "../src/openapi";

async function main(): Promise<void> {
  const output = path.resolve(process.cwd(), "../../packages/api-client/openapi.json");
  const document = await createOpenApiDocument();
  await writeFile(output, JSON.stringify(document, null, 2) + "\n", "utf8");
  console.log(`Wrote ${output}`);
}

void main().catch((error: unknown) => {
  console.error("OpenAPI generation failed", error);
  process.exitCode = 1;
});
