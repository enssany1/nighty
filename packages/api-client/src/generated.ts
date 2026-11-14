/* Generated from openapi.json. Do not edit by hand. */
export interface components {
  schemas: {
    "AttachmentResponseDto": {
      "id": string;
      "originalName": string;
      "mimeType": string;
      "byteSize": number;
      "disposition": "INLINE" | "ATTACHMENT";
      "downloadUrl": string;
    };
    "AuditEventResponseDto": {
      "id": string;
      "actorUserId"?: string;
      "action": string;
      "entityType": string;
      "entityId": string;
      "before"?: Record<string, unknown>;
      "after"?: Record<string, unknown>;
      "createdAt": string;
    };
    "CanvasResponseDto": {
      "operationalDayId": string;
      "operationalDate": string;
      "shifts": Array<components["schemas"]["ShiftCanvasDto"]>;
    };
    "ChangePasswordRequestDto": {
      "currentPassword": string;
      "newPassword": string;
    };
    "CreateEntryRequestDto": {
      "type": "UPDATE" | "TODO" | "FOLLOW";
      "editorDocument": Record<string, unknown>;
      "plainText": string;
      "todoItems"?: Array<components["schemas"]["TodoItemDto"]>;
      "tagIds"?: Array<string>;
    };
    "CreateUserRequestDto": {
      "username": string;
      "displayName": string;
      "role": "ADMIN" | "OPERATOR";
      "shiftIds": Array<string>;
    };
    "EntryResponseDto": {
      "id": string;
      "type": "UPDATE" | "TODO" | "FOLLOW";
      "editorDocument": Record<string, unknown>;
      "plainText": string;
      "followStatus"?: "OPEN" | "COMPLETED";
      "todoItems": Array<components["schemas"]["TodoItemDto"]>;
      "authorId": string;
      "createdAt": string;
    };
    "HandoverResponseDto": {
      "closedShiftId": string;
      "openedShiftId": string;
      "transferredFollowCount": number;
      "alreadyCompleted": boolean;
    };
    "LoginRequestDto": {
      "username": string;
      "password": string;
    };
    "SaveShiftDefinitionRequestDto": {
      "name": string;
      "startMinute": number;
      "endMinute": number;
      "active": boolean;
    };
    "SaveTagRequestDto": {
      "name": string;
    };
    "SearchResponseDto": {
      "items": Array<components["schemas"]["SearchResultDto"]>;
      "nextCursor"?: string;
    };
    "SearchResultDto": {
      "entryId": string;
      "operationalDate": string;
      "shiftName": string;
      "type": "UPDATE" | "TODO" | "FOLLOW";
      "plainText": string;
    };
    "SessionResponseDto": {
      "userId": string;
      "displayName": string;
      "role": "ADMIN" | "OPERATOR";
      "csrfToken": string;
      "expiresAt": string;
    };
    "SettingResponseDto": {
      "key": string;
      "value": Record<string, unknown>;
      "updatedAt": string;
    };
    "ShiftCanvasDto": {
      "id": string;
      "name": string;
      "status": "UPCOMING" | "ACTIVE" | "CLOSED";
      "writable": boolean;
      "entries": Array<components["schemas"]["EntryResponseDto"]>;
    };
    "ShiftDefinitionResponseDto": {
      "id": string;
      "name": string;
      "startMinute": number;
      "endMinute": number;
      "position": number;
      "active": boolean;
    };
    "TagResponseDto": {
      "id": string;
      "name": string;
      "position": number;
      "archived": boolean;
    };
    "TodoItemDto": {
      "id"?: string;
      "text": string;
      "completed"?: boolean;
      "position": number;
    };
    "UserResponseDto": {
      "id": string;
      "username": string;
      "displayName": string;
      "role": "ADMIN" | "OPERATOR";
      "status": "ACTIVE" | "DISABLED";
      "shiftIds": Array<string>;
      "mustChangePassword": boolean;
    };
  };
}

export interface paths {
  "/api/attachments": {
    post: {
      operationId: "attachments_create";
      request: unknown;
      response: components["schemas"]["AttachmentResponseDto"];
    };
  };
  "/api/audit": {
    get: {
      operationId: "audit_list";
      request: unknown;
      response: components["schemas"]["AuditEventResponseDto"];
    };
  };
  "/api/auth/change-password": {
    post: {
      operationId: "AuthController_changePassword";
      request: unknown;
      response: unknown;
    };
  };
  "/api/auth/login": {
    post: {
      operationId: "auth_login";
      request: components["schemas"]["LoginRequestDto"];
      response: components["schemas"]["SessionResponseDto"];
    };
  };
  "/api/auth/logout": {
    post: {
      operationId: "AuthController_logout";
      request: unknown;
      response: unknown;
    };
  };
  "/api/auth/me": {
    get: {
      operationId: "auth_me";
      request: unknown;
      response: components["schemas"]["SessionResponseDto"];
    };
  };
  "/api/canvas/{operationalDate}": {
    get: {
      operationId: "canvas_get";
      request: unknown;
      response: components["schemas"]["CanvasResponseDto"];
    };
  };
  "/api/health": {
    get: {
      operationId: "HealthController_getHealth";
      request: unknown;
      response: unknown;
    };
  };
  "/api/search": {
    get: {
      operationId: "search_list";
      request: unknown;
      response: components["schemas"]["SearchResponseDto"];
    };
  };
  "/api/settings/{key}": {
    get: {
      operationId: "settings_get";
      request: unknown;
      response: components["schemas"]["SettingResponseDto"];
    };
  };
  "/api/shift-instances/{shiftId}/entries": {
    post: {
      operationId: "entries_create";
      request: components["schemas"]["CreateEntryRequestDto"];
      response: components["schemas"]["EntryResponseDto"];
    };
  };
  "/api/shift-instances/{shiftId}/handover": {
    post: {
      operationId: "handover_complete";
      request: unknown;
      response: components["schemas"]["HandoverResponseDto"];
    };
  };
  "/api/shifts": {
    get: {
      operationId: "shifts_list";
      request: unknown;
      response: components["schemas"]["ShiftDefinitionResponseDto"];
    };
    post: {
      operationId: "shifts_create";
      request: components["schemas"]["SaveShiftDefinitionRequestDto"];
      response: components["schemas"]["ShiftDefinitionResponseDto"];
    };
  };
  "/api/tags": {
    get: {
      operationId: "tags_list";
      request: unknown;
      response: components["schemas"]["TagResponseDto"];
    };
    post: {
      operationId: "tags_create";
      request: components["schemas"]["SaveTagRequestDto"];
      response: components["schemas"]["TagResponseDto"];
    };
  };
  "/api/users": {
    get: {
      operationId: "users_list";
      request: unknown;
      response: components["schemas"]["UserResponseDto"];
    };
    post: {
      operationId: "users_create";
      request: components["schemas"]["CreateUserRequestDto"];
      response: components["schemas"]["UserResponseDto"];
    };
  };
}

export type AttachmentResponseDto = components["schemas"]["AttachmentResponseDto"];
export type AuditEventResponseDto = components["schemas"]["AuditEventResponseDto"];
export type CanvasResponseDto = components["schemas"]["CanvasResponseDto"];
export type ChangePasswordRequestDto = components["schemas"]["ChangePasswordRequestDto"];
export type CreateEntryRequestDto = components["schemas"]["CreateEntryRequestDto"];
export type CreateUserRequestDto = components["schemas"]["CreateUserRequestDto"];
export type EntryResponseDto = components["schemas"]["EntryResponseDto"];
export type HandoverResponseDto = components["schemas"]["HandoverResponseDto"];
export type LoginRequestDto = components["schemas"]["LoginRequestDto"];
export type SaveShiftDefinitionRequestDto = components["schemas"]["SaveShiftDefinitionRequestDto"];
export type SaveTagRequestDto = components["schemas"]["SaveTagRequestDto"];
export type SearchResponseDto = components["schemas"]["SearchResponseDto"];
export type SearchResultDto = components["schemas"]["SearchResultDto"];
export type SessionResponseDto = components["schemas"]["SessionResponseDto"];
export type SettingResponseDto = components["schemas"]["SettingResponseDto"];
export type ShiftCanvasDto = components["schemas"]["ShiftCanvasDto"];
export type ShiftDefinitionResponseDto = components["schemas"]["ShiftDefinitionResponseDto"];
export type TagResponseDto = components["schemas"]["TagResponseDto"];
export type TodoItemDto = components["schemas"]["TodoItemDto"];
export type UserResponseDto = components["schemas"]["UserResponseDto"];
