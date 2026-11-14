import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";

export enum UserRoleDto { ADMIN = "ADMIN", OPERATOR = "OPERATOR" }
export enum UserStatusDto { ACTIVE = "ACTIVE", DISABLED = "DISABLED" }
export enum ShiftStatusDto { UPCOMING = "UPCOMING", ACTIVE = "ACTIVE", CLOSED = "CLOSED" }
export enum EntryTypeDto { UPDATE = "UPDATE", TODO = "TODO", FOLLOW = "FOLLOW" }
export enum FollowStatusDto { OPEN = "OPEN", COMPLETED = "COMPLETED" }
export enum AttachmentDispositionDto { INLINE = "INLINE", ATTACHMENT = "ATTACHMENT" }

export class LoginRequestDto {
  @ApiProperty({ type: String, example: "aisha" })
  @IsString() @Matches(/^[a-z0-9][a-z0-9._-]{2,79}$/)
  username!: string;

  @ApiProperty({ type: String, minLength: 8, writeOnly: true })
  @IsString() @MinLength(8)
  password!: string;
}

export class ChangePasswordRequestDto {
  @ApiProperty({ type: String, minLength: 8, writeOnly: true })
  @IsString() @MinLength(8)
  currentPassword!: string;

  @ApiProperty({ type: String, minLength: 12, writeOnly: true })
  @IsString() @MinLength(12)
  newPassword!: string;
}

export class SessionResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() userId!: string;
  @ApiProperty({ type: String }) @IsString() displayName!: string;
  @ApiProperty({ enum: UserRoleDto }) @IsEnum(UserRoleDto) role!: UserRoleDto;
  @ApiProperty({ type: String }) @IsString() csrfToken!: string;
  @ApiProperty({ type: String, format: "date-time" }) @IsDateString() expiresAt!: string;
}

export class UserResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ type: String }) @IsString() username!: string;
  @ApiProperty({ type: String }) @IsString() displayName!: string;
  @ApiProperty({ enum: UserRoleDto }) @IsEnum(UserRoleDto) role!: UserRoleDto;
  @ApiProperty({ enum: UserStatusDto }) @IsEnum(UserStatusDto) status!: UserStatusDto;
  @ApiProperty({ type: [String], format: "uuid" }) @IsArray() @IsUUID("4", { each: true }) shiftIds!: string[];
  @ApiProperty({ type: Boolean }) @IsBoolean() mustChangePassword!: boolean;
}

export class CreateUserRequestDto {
  @ApiProperty({ type: String }) @Transform(({ value }) => typeof value === "string" ? value.trim().toLowerCase() : value) @Matches(/^[a-z0-9][a-z0-9._-]{2,79}$/) username!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 160) displayName!: string;
  @ApiProperty({ enum: UserRoleDto }) @IsEnum(UserRoleDto) role!: UserRoleDto;
  @ApiProperty({ type: [String], format: "uuid" }) @IsArray() @IsUUID("4", { each: true }) shiftIds!: string[];
}

export class UpdateUserRequestDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @Length(1, 160) displayName?: string;
  @ApiPropertyOptional({ enum: UserRoleDto }) @IsOptional() @IsEnum(UserRoleDto) role?: UserRoleDto;
  @ApiPropertyOptional({ enum: UserStatusDto }) @IsOptional() @IsEnum(UserStatusDto) status?: UserStatusDto;
  @ApiPropertyOptional({ type: [String], format: "uuid" }) @IsOptional() @IsArray() @IsUUID("4", { each: true }) shiftIds?: string[];
}

export class UpdateProfileRequestDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 160) displayName!: string;
}

export class TemporaryPasswordResponseDto {
  @ApiProperty({ type: String, writeOnly: true }) @IsString() temporaryPassword!: string;
}

export class ShiftDefinitionResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ type: String }) @IsString() name!: string;
  @ApiProperty({ type: Number, minimum: 0, maximum: 1439 }) @IsInt() @Min(0) @Max(1439) startMinute!: number;
  @ApiProperty({ type: Number, minimum: 0, maximum: 1439 }) @IsInt() @Min(0) @Max(1439) endMinute!: number;
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) position!: number;
  @ApiProperty({ type: Boolean }) @IsBoolean() active!: boolean;
}

export class SaveShiftDefinitionRequestDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 80) name!: string;
  @ApiProperty({ type: Number, minimum: 0, maximum: 1439 }) @IsInt() @Min(0) @Max(1439) startMinute!: number;
  @ApiProperty({ type: Number, minimum: 0, maximum: 1439 }) @IsInt() @Min(0) @Max(1439) endMinute!: number;
  @ApiProperty({ type: Boolean }) @IsBoolean() active!: boolean;
}

export class TodoItemDto {
  @ApiPropertyOptional({ type: String, format: "uuid" }) @IsOptional() @IsUUID() id?: string;
  @ApiProperty({ type: String }) @IsString() @MinLength(1) text!: string;
  @ApiPropertyOptional({ type: Boolean, default: false }) @IsOptional() @IsBoolean() completed?: boolean;
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) position!: number;
}

export class EntryResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ enum: EntryTypeDto }) @IsEnum(EntryTypeDto) type!: EntryTypeDto;
  @ApiProperty({ type: "object", additionalProperties: true }) @IsObject() editorDocument!: Record<string, unknown>;
  @ApiProperty({ type: String }) @IsString() plainText!: string;
  @ApiPropertyOptional({ enum: FollowStatusDto }) @IsOptional() @IsEnum(FollowStatusDto) followStatus?: FollowStatusDto;
  @ApiProperty({ type: [TodoItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => TodoItemDto) todoItems!: TodoItemDto[];
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() authorId!: string;
  @ApiProperty({ type: String, format: "date-time" }) @IsDateString() createdAt!: string;
}

export class CreateEntryRequestDto {
  @ApiProperty({ enum: EntryTypeDto }) @IsEnum(EntryTypeDto) type!: EntryTypeDto;
  @ApiProperty({ type: "object", additionalProperties: true }) @IsObject() editorDocument!: Record<string, unknown>;
  @ApiProperty({ type: String }) @IsString() @MinLength(1) plainText!: string;
  @ApiPropertyOptional({ type: [TodoItemDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TodoItemDto) todoItems?: TodoItemDto[];
  @ApiPropertyOptional({ type: [String], format: "uuid" }) @IsOptional() @IsArray() @IsUUID("4", { each: true }) tagIds?: string[];
}

export class ShiftCanvasDto {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ type: String }) @IsString() name!: string;
  @ApiProperty({ enum: ShiftStatusDto }) @IsEnum(ShiftStatusDto) status!: ShiftStatusDto;
  @ApiProperty({ type: Boolean }) @IsBoolean() writable!: boolean;
  @ApiProperty({ type: [EntryResponseDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => EntryResponseDto) entries!: EntryResponseDto[];
}

export class CanvasResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() operationalDayId!: string;
  @ApiProperty({ type: String, format: "date" }) @IsDateString() operationalDate!: string;
  @ApiProperty({ type: [ShiftCanvasDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => ShiftCanvasDto) shifts!: ShiftCanvasDto[];
}

export class HandoverResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() closedShiftId!: string;
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() openedShiftId!: string;
  @ApiProperty({ type: Number, minimum: 0 }) @IsInt() @Min(0) transferredFollowCount!: number;
  @ApiProperty({ type: Boolean }) @IsBoolean() alreadyCompleted!: boolean;
}

export class TagResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ type: String }) @Matches(/^[a-z0-9][a-z0-9-]{0,79}$/) name!: string;
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) position!: number;
  @ApiProperty({ type: Boolean }) @IsBoolean() archived!: boolean;
}

export class SaveTagRequestDto {
  @ApiProperty({ type: String }) @Matches(/^[a-z0-9][a-z0-9-]{0,79}$/) name!: string;
}

export class AttachmentResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() id!: string;
  @ApiProperty({ type: String }) @IsString() originalName!: string;
  @ApiProperty({ type: String }) @IsString() mimeType!: string;
  @ApiProperty({ type: Number, minimum: 1 }) @IsInt() @Min(1) byteSize!: number;
  @ApiProperty({ enum: AttachmentDispositionDto }) @IsEnum(AttachmentDispositionDto) disposition!: AttachmentDispositionDto;
  @ApiProperty({ type: String }) @IsString() downloadUrl!: string;
}

export class SearchResultDto {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() entryId!: string;
  @ApiProperty({ type: String, format: "date" }) @IsDateString() operationalDate!: string;
  @ApiProperty({ type: String }) @IsString() shiftName!: string;
  @ApiProperty({ enum: EntryTypeDto }) @IsEnum(EntryTypeDto) type!: EntryTypeDto;
  @ApiProperty({ type: String }) @IsString() plainText!: string;
}

export class SearchResponseDto {
  @ApiProperty({ type: [SearchResultDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => SearchResultDto) items!: SearchResultDto[];
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() nextCursor?: string;
}

export class SettingResponseDto {
  @ApiProperty({ type: String }) @IsString() key!: string;
  @ApiProperty({ type: "object", additionalProperties: true }) value!: unknown;
  @ApiProperty({ type: String, format: "date-time" }) @IsDateString() updatedAt!: string;
}

export class AuditEventResponseDto {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() id!: string;
  @ApiPropertyOptional({ type: String, format: "uuid" }) @IsOptional() @IsUUID() actorUserId?: string;
  @ApiProperty({ type: String }) @IsString() action!: string;
  @ApiProperty({ type: String }) @IsString() entityType!: string;
  @ApiProperty({ type: String }) @IsString() entityId!: string;
  @ApiPropertyOptional({ type: "object", additionalProperties: true }) @IsOptional() before?: unknown;
  @ApiPropertyOptional({ type: "object", additionalProperties: true }) @IsOptional() after?: unknown;
  @ApiProperty({ type: String, format: "date-time" }) @IsDateString() createdAt!: string;
}

export const NIGHTY_OPENAPI_MODELS = [
  LoginRequestDto, ChangePasswordRequestDto, SessionResponseDto, UserResponseDto, CreateUserRequestDto,
  UpdateUserRequestDto, UpdateProfileRequestDto, TemporaryPasswordResponseDto,
  ShiftDefinitionResponseDto, SaveShiftDefinitionRequestDto, TodoItemDto,
  EntryResponseDto, CreateEntryRequestDto, ShiftCanvasDto, CanvasResponseDto,
  HandoverResponseDto, TagResponseDto, SaveTagRequestDto, AttachmentResponseDto,
  SearchResultDto, SearchResponseDto, SettingResponseDto, AuditEventResponseDto,
] as const;
