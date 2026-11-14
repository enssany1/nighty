import { BadRequestException } from "@nestjs/common";
import { normalizeTagName } from "./tags.service";

describe("Tag boundaries", () => {
  it("normalizes editable Tag names", () => {
    expect(normalizeTagName("  Major Incident  ")).toBe("major-incident");
    expect(() => normalizeTagName("***")).toThrow(BadRequestException);
  });
});
