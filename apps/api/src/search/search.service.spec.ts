import { BadRequestException } from "@nestjs/common";
import { parseSearchQuery } from "./search.service";

describe("search query boundary", () => {
  it("normalizes bounded pagination and inclusive dates", () => {
    expect(parseSearchQuery({ q: "  API  ", from: "2026-11-01", to: "2026-11-14", take: "25" })).toMatchObject({
      q: "API", from: new Date("2026-11-01T00:00:00.000Z"), to: new Date("2026-11-14T00:00:00.000Z"), take: 25,
    });
  });

  it("rejects reversed dates and unbounded page sizes", () => {
    expect(() => parseSearchQuery({ from: "2026-11-14", to: "2026-11-01" })).toThrow(BadRequestException);
    expect(() => parseSearchQuery({ take: "500" })).toThrow(BadRequestException);
  });
});
