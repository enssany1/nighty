import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { NIGHTY_OPENAPI_MODELS } from "./common/dto/contracts";

export async function createOpenApiDocument(): Promise<OpenAPIObject> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api");
  await app.init();
  try {
    const config = new DocumentBuilder()
      .setTitle("Nighty API")
      .setDescription("Shift Operations Handover API")
      .setVersion("1.0.0")
      .addCookieAuth("nighty_session")
      .build();
    const document = SwaggerModule.createDocument(app, config, {
      extraModels: [...NIGHTY_OPENAPI_MODELS],
      operationIdFactory: (controller, method) => `${controller}_${method}`,
    });
    const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
    const content = (name: string) => ({ "application/json": { schema: ref(name) } });
    const operation = (operationId: string, response: string, request?: string) => ({
      operationId,
      security: [{ nighty_session: [] }],
      ...(request ? { requestBody: { required: true, content: content(request) } } : {}),
      responses: { "200": { description: "Successful response", content: content(response) } },
    });
    document.paths = {
      ...document.paths,
      "/api/auth/login": { post: { ...operation("auth_login", "SessionResponseDto", "LoginRequestDto"), security: [] } },
      "/api/auth/me": { get: operation("auth_me", "SessionResponseDto") },
      "/api/users": {
        get: operation("users_list", "UserResponseDto"),
        post: operation("users_create", "UserResponseDto", "CreateUserRequestDto"),
      },
      "/api/shifts": {
        get: operation("shifts_list", "ShiftDefinitionResponseDto"),
        post: operation("shifts_create", "ShiftDefinitionResponseDto", "SaveShiftDefinitionRequestDto"),
      },
      "/api/canvas/{operationalDate}": { get: operation("canvas_get", "CanvasResponseDto") },
      "/api/shift-instances/{shiftId}/entries": { post: operation("entries_create", "EntryResponseDto", "CreateEntryRequestDto") },
      "/api/shift-instances/{shiftId}/handover": { post: operation("handover_complete", "HandoverResponseDto") },
      "/api/tags": {
        get: operation("tags_list", "TagResponseDto"),
        post: operation("tags_create", "TagResponseDto", "SaveTagRequestDto"),
      },
      "/api/attachments": { post: operation("attachments_create", "AttachmentResponseDto") },
      "/api/search": { get: operation("search_list", "SearchResponseDto") },
      "/api/settings/{key}": { get: operation("settings_get", "SettingResponseDto") },
      "/api/audit": { get: operation("audit_list", "AuditEventResponseDto") },
    };
    return document;
  } finally {
    await app.close();
  }
}
