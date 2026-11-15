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
      "metadata"?: Record<string, unknown>;
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
    "CreateTagPostRequestDto": {
      "editorDocument": Record<string, unknown>;
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
    "GeneralSettingsRequestDto": {
      "applicationName": string;
      "subtitle": string;
      "timezone": string;
      "dateFormat": string;
      "timeFormat": "12-hour" | "24-hour";
      "defaultLanding": "current-operational-day";
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
    "ReorderShiftsRequestDto": {
      "shiftIds": Array<string>;
    };
    "ReorderTagsRequestDto": {
      "tagIds": Array<string>;
    };
    "RetentionSettingsRequestDto": {
      "retentionDays": number;
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
    "SecuritySettingsRequestDto": {
      "sessionIdleMinutes": 30;
      "passwordMinLength": number;
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
    "TemporaryPasswordResponseDto": {
      "temporaryPassword": string;
    };
    "TodoItemDto": {
      "id"?: string;
      "text": string;
      "completed"?: boolean;
      "position": number;
    };
    "ToggleTodoRequestDto": {
      "completed": boolean;
    };
    "UpdateFollowStatusRequestDto": {
      "status": "OPEN" | "COMPLETED";
    };
    "UpdateProfileRequestDto": {
      "displayName": string;
    };
    "UpdateTagRequestDto": {
      "name"?: string;
      "archived"?: boolean;
    };
    "UpdateUserRequestDto": {
      "displayName"?: string;
      "role"?: "ADMIN" | "OPERATOR";
      "status"?: "ACTIVE" | "DISABLED";
      "shiftIds"?: Array<string>;
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
  "/api/attachments/{id}/download": {
    get: {
      operationId: "AttachmentsController_download";
      request: unknown;
      response: unknown;
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
  "/api/canvas/{date}": {
    get: {
      operationId: "EntriesController_getCanvas";
      request: unknown;
      response: unknown;
    };
  };
  "/api/canvas/{operationalDate}": {
    get: {
      operationId: "canvas_get";
      request: unknown;
      response: components["schemas"]["CanvasResponseDto"];
    };
  };
  "/api/entries/{id}": {
    patch: {
      operationId: "EntriesController_edit";
      request: unknown;
      response: unknown;
    };
  };
  "/api/entries/{id}/history": {
    get: {
      operationId: "EntriesController_history";
      request: unknown;
      response: unknown;
    };
  };
  "/api/follows/{id}/status": {
    patch: {
      operationId: "HandoverController_updateFollow";
      request: unknown;
      response: unknown;
    };
  };
  "/api/health": {
    get: {
      operationId: "HealthController_getHealth";
      request: unknown;
      response: unknown;
    };
  };
  "/api/health/live": {
    get: {
      operationId: "HealthController_live";
      request: unknown;
      response: unknown;
    };
  };
  "/api/health/ready": {
    get: {
      operationId: "HealthController_ready";
      request: unknown;
      response: unknown;
    };
  };
  "/api/operational-days/{date}/materialize": {
    post: {
      operationId: "OperationalDaysController_materialize";
      request: unknown;
      response: unknown;
    };
  };
  "/api/operational-days/current": {
    get: {
      operationId: "OperationalDaysController_current";
      request: unknown;
      response: unknown;
    };
  };
  "/api/profile": {
    get: {
      operationId: "ProfileController_get";
      request: unknown;
      response: unknown;
    };
    patch: {
      operationId: "ProfileController_update";
      request: unknown;
      response: unknown;
    };
  };
  "/api/retention/preview": {
    get: {
      operationId: "RetentionController_preview";
      request: unknown;
      response: unknown;
    };
  };
  "/api/retention/run": {
    post: {
      operationId: "RetentionController_run";
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
  "/api/settings": {
    get: {
      operationId: "SettingsController_getAll";
      request: unknown;
      response: unknown;
    };
  };
  "/api/settings/{key}": {
    get: {
      operationId: "settings_get";
      request: unknown;
      response: components["schemas"]["SettingResponseDto"];
    };
  };
  "/api/settings/general": {
    patch: {
      operationId: "SettingsController_updateGeneral";
      request: unknown;
      response: unknown;
    };
  };
  "/api/settings/retention": {
    patch: {
      operationId: "SettingsController_updateRetention";
      request: unknown;
      response: unknown;
    };
  };
  "/api/settings/security": {
    patch: {
      operationId: "SettingsController_updateSecurity";
      request: unknown;
      response: unknown;
    };
  };
  "/api/shift-instances/{id}/handover": {
    post: {
      operationId: "HandoverController_handover";
      request: unknown;
      response: unknown;
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
  "/api/shifts/{id}": {
    patch: {
      operationId: "ShiftsController_update";
      request: unknown;
      response: unknown;
    };
    delete: {
      operationId: "ShiftsController_delete";
      request: unknown;
      response: unknown;
    };
  };
  "/api/shifts/reorder": {
    post: {
      operationId: "ShiftsController_reorder";
      request: unknown;
      response: unknown;
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
  "/api/tags/{id}": {
    patch: {
      operationId: "TagsController_update";
      request: unknown;
      response: unknown;
    };
    delete: {
      operationId: "TagsController_delete";
      request: unknown;
      response: unknown;
    };
  };
  "/api/tags/{id}/posts": {
    get: {
      operationId: "TagsController_posts";
      request: unknown;
      response: unknown;
    };
    post: {
      operationId: "TagsController_createPost";
      request: unknown;
      response: unknown;
    };
  };
  "/api/tags/reorder": {
    post: {
      operationId: "TagsController_reorder";
      request: unknown;
      response: unknown;
    };
  };
  "/api/team": {
    get: {
      operationId: "TeamController_list";
      request: unknown;
      response: unknown;
    };
  };
  "/api/todo-items/{id}": {
    patch: {
      operationId: "EntriesController_toggle";
      request: unknown;
      response: unknown;
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
  "/api/users/{id}": {
    patch: {
      operationId: "UsersController_update";
      request: unknown;
      response: unknown;
    };
    delete: {
      operationId: "UsersController_delete";
      request: unknown;
      response: unknown;
    };
  };
  "/api/users/{id}/reset-password": {
    post: {
      operationId: "UsersController_resetPassword";
      request: unknown;
      response: unknown;
    };
  };
}

export type AttachmentResponseDto = components["schemas"]["AttachmentResponseDto"];
export type AuditEventResponseDto = components["schemas"]["AuditEventResponseDto"];
export type CanvasResponseDto = components["schemas"]["CanvasResponseDto"];
export type ChangePasswordRequestDto = components["schemas"]["ChangePasswordRequestDto"];
export type CreateEntryRequestDto = components["schemas"]["CreateEntryRequestDto"];
export type CreateTagPostRequestDto = components["schemas"]["CreateTagPostRequestDto"];
export type CreateUserRequestDto = components["schemas"]["CreateUserRequestDto"];
export type EntryResponseDto = components["schemas"]["EntryResponseDto"];
export type GeneralSettingsRequestDto = components["schemas"]["GeneralSettingsRequestDto"];
export type HandoverResponseDto = components["schemas"]["HandoverResponseDto"];
export type LoginRequestDto = components["schemas"]["LoginRequestDto"];
export type ReorderShiftsRequestDto = components["schemas"]["ReorderShiftsRequestDto"];
export type ReorderTagsRequestDto = components["schemas"]["ReorderTagsRequestDto"];
export type RetentionSettingsRequestDto = components["schemas"]["RetentionSettingsRequestDto"];
export type SaveShiftDefinitionRequestDto = components["schemas"]["SaveShiftDefinitionRequestDto"];
export type SaveTagRequestDto = components["schemas"]["SaveTagRequestDto"];
export type SearchResponseDto = components["schemas"]["SearchResponseDto"];
export type SearchResultDto = components["schemas"]["SearchResultDto"];
export type SecuritySettingsRequestDto = components["schemas"]["SecuritySettingsRequestDto"];
export type SessionResponseDto = components["schemas"]["SessionResponseDto"];
export type SettingResponseDto = components["schemas"]["SettingResponseDto"];
export type ShiftCanvasDto = components["schemas"]["ShiftCanvasDto"];
export type ShiftDefinitionResponseDto = components["schemas"]["ShiftDefinitionResponseDto"];
export type TagResponseDto = components["schemas"]["TagResponseDto"];
export type TemporaryPasswordResponseDto = components["schemas"]["TemporaryPasswordResponseDto"];
export type TodoItemDto = components["schemas"]["TodoItemDto"];
export type ToggleTodoRequestDto = components["schemas"]["ToggleTodoRequestDto"];
export type UpdateFollowStatusRequestDto = components["schemas"]["UpdateFollowStatusRequestDto"];
export type UpdateProfileRequestDto = components["schemas"]["UpdateProfileRequestDto"];
export type UpdateTagRequestDto = components["schemas"]["UpdateTagRequestDto"];
export type UpdateUserRequestDto = components["schemas"]["UpdateUserRequestDto"];
export type UserResponseDto = components["schemas"]["UserResponseDto"];
