export function decideBootstrap({ existingUserCount, username, password }) {
  if (!Number.isInteger(existingUserCount) || existingUserCount < 0) {
    throw new Error("Existing user count must be a non-negative integer");
  }
  if (existingUserCount > 0) return "skip";
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username)) {
    throw new Error("BOOTSTRAP_ADMIN_USERNAME is required for an empty database and must be valid");
  }
  if (password.length < 12) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD is required for an empty database and must contain at least 12 characters");
  }
  return "create";
}
