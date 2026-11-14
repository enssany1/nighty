import { SetMetadata } from "@nestjs/common";
import { UserRole } from "../../generated/prisma/enums";

export const REQUIRED_ROLES = "nighty:required-roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(REQUIRED_ROLES, roles);
