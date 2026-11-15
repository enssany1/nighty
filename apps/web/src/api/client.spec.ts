import { describe, expect, it } from "vitest";
import { appUrl } from "./client";

describe("appUrl", () => {
  it("keeps root deployments on the existing paths", () => {
    expect(appUrl("/api/session", "/")).toBe("/api/session");
  });

  it("prefixes API and attachment paths for a subpath deployment", () => {
    expect(appUrl("/api/session", "/nighty/")).toBe("/nighty/api/session");
    expect(appUrl("/api/attachments/123/download", "/nighty/")).toBe(
      "/nighty/api/attachments/123/download",
    );
  });
});
