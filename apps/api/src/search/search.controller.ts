import { Controller, Get, Inject, Query } from "@nestjs/common";
import { SearchService } from "./search.service";

@Controller("search")
export class SearchController {
  constructor(@Inject(SearchService) private readonly searchService: SearchService) {}

  @Get()
  search(
    @Query("q") q?: string, @Query("from") from?: string, @Query("to") to?: string,
    @Query("operator") operator?: string, @Query("shift") shift?: string, @Query("tag") tag?: string,
    @Query("type") type?: string, @Query("followStatus") followStatus?: string,
    @Query("take") take?: string, @Query("cursor") cursor?: string,
  ) {
    return this.searchService.search({
      ...(q ? { q } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}),
      ...(operator ? { operator } : {}), ...(shift ? { shift } : {}), ...(tag ? { tag } : {}),
      ...(type ? { type } : {}), ...(followStatus ? { followStatus } : {}),
      ...(take ? { take } : {}), ...(cursor ? { cursor } : {}),
    });
  }
}
