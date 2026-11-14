import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { LoginRequestDto, CreateEntryRequestDto } from "../src/common/dto/contracts";
import { createOpenApiDocument } from "../src/openapi";

describe("Nighty OpenAPI contract", () => {
  it("rejects unknown request fields", async () => {
    const login = plainToInstance(LoginRequestDto, {
      username: "aisha",
      password: "valid-password",
      unexpected: true,
    });
    const errors = await validate(login, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.some((error) => error.property === "unexpected")).toBe(true);
  });

  it("exposes every approved V1 contract area", async () => {
    const document = await createOpenApiDocument();
    const schemas = new Set(Object.keys(document.components?.schemas ?? {}));
    for (const schema of [
      "LoginRequestDto", "SessionResponseDto", "UserResponseDto",
      "ShiftDefinitionResponseDto", "CanvasResponseDto", "CreateEntryRequestDto",
      "HandoverResponseDto", "TagResponseDto", "AttachmentResponseDto",
      "SearchResponseDto", "SettingResponseDto", "AuditEventResponseDto",
    ]) {
      expect(schemas).toContain(schema);
    }

    for (const path of [
      "/api/auth/login", "/api/auth/me", "/api/users", "/api/shifts",
      "/api/canvas/{operationalDate}", "/api/shift-instances/{shiftId}/entries",
      "/api/shift-instances/{shiftId}/handover", "/api/tags", "/api/attachments",
      "/api/search", "/api/settings/{key}", "/api/audit",
    ]) {
      expect(document.paths).toHaveProperty(path);
    }

    expect(document.components?.schemas?.CreateEntryRequestDto).toMatchObject({
      required: expect.arrayContaining(["type", "editorDocument", "plainText"]),
      properties: {
        type: { enum: ["UPDATE", "TODO", "FOLLOW"] },
      },
    });
  });

  it("accepts only Update, To-do list, and Follow entry actions", async () => {
    const invalid = plainToInstance(CreateEntryRequestDto, {
      type: "DECISION",
      editorDocument: { type: "doc", content: [] },
      plainText: "Not allowed",
    });
    const errors = await validate(invalid);
    expect(errors.some((error) => error.property === "type")).toBe(true);
  });
});
