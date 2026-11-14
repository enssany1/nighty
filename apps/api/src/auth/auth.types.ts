import type { UserRole } from "../generated/prisma/enums";

export interface AuthenticatedSession {
  sessionId: string;
  csrfDigest: string;
  expiresAt: Date;
  user: {
    id: string;
    displayName: string;
    role: UserRole;
    mustChangePassword: boolean;
  };
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedSession;
    }
  }
}
