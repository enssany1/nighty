import { BadRequestException } from "@nestjs/common";
import { safeDisplayName, sniffMime } from "./attachments.service";

describe("attachment boundaries", () => {
  it("sniffs known image bytes instead of trusting the declaration", () => {
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(() => sniffMime(Buffer.from([0, 1, 2, 3]))).toThrow(BadRequestException);
  });

  it("removes every path component from display names", () => {
    expect(safeDisplayName("../../secret.png")).toBe("secret.png");
    expect(safeDisplayName("..\\..\\secret.png")).toBe("secret.png");
  });
});
