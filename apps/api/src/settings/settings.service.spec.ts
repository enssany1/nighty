import { parseSetting, SETTING_DEFAULTS } from "./settings.service";

describe("typed Settings", () => {
  it("owns the approved defaults", () => {
    expect(SETTING_DEFAULTS.timezone).toBe("Asia/Muscat");
    expect(SETTING_DEFAULTS.timeFormat).toBe("24-hour");
    expect(SETTING_DEFAULTS.sessionIdleMinutes).toBe(30);
    expect(SETTING_DEFAULTS.retentionDays).toBe(365);
  });

  it("rejects malformed persisted values instead of coercing them", () => {
    expect(parseSetting("retentionDays", 365)).toBe(365);
    expect(() => parseSetting("retentionDays", "365")).toThrow();
  });
});
