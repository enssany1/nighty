import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma, type EntryType, type FollowStatus } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";

interface RawSearchQuery {
  q?: string;
  from?: string;
  to?: string;
  operator?: string;
  shift?: string;
  tag?: string;
  type?: string;
  followStatus?: string;
  take?: string;
  cursor?: string;
}

function parseDate(value: string, name: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${name} must use YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${name} is invalid`);
  return date;
}

export function parseSearchQuery(raw: RawSearchQuery) {
  const from = raw.from ? parseDate(raw.from, "from") : undefined;
  const to = raw.to ? parseDate(raw.to, "to") : undefined;
  if (from && to && from > to) throw new BadRequestException("from cannot be after to");
  const take = raw.take === undefined ? 20 : Number(raw.take);
  if (!Number.isInteger(take) || take < 1 || take > 50) throw new BadRequestException("take must be from 1 to 50");
  if (raw.type && !["UPDATE", "TODO", "FOLLOW"].includes(raw.type)) throw new BadRequestException("Invalid action type");
  if (raw.followStatus && !["OPEN", "COMPLETED"].includes(raw.followStatus)) throw new BadRequestException("Invalid Follow status");
  let cursor: { createdAt: Date; id: string } | undefined;
  if (raw.cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(raw.cursor, "base64url").toString("utf8")) as { createdAt: string; id: string };
      cursor = { createdAt: new Date(parsed.createdAt), id: parsed.id };
      if (Number.isNaN(cursor.createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(cursor.id)) throw new Error();
    } catch { throw new BadRequestException("Invalid search cursor"); }
  }
  return {
    ...(raw.q?.trim() ? { q: raw.q.trim() } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}),
    ...(raw.operator ? { operator: raw.operator } : {}), ...(raw.shift ? { shift: raw.shift } : {}),
    ...(raw.tag ? { tag: raw.tag } : {}), ...(raw.type ? { type: raw.type as EntryType } : {}),
    ...(raw.followStatus ? { followStatus: raw.followStatus as FollowStatus } : {}),
    ...(cursor ? { cursor } : {}), take,
  };
}

@Injectable()
export class SearchService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async search(raw: RawSearchQuery) {
    const query = parseSearchQuery(raw);
    const where: Prisma.EntryWhereInput = {
      ...(query.q ? { plainText: { contains: query.q, mode: "insensitive" } } : {}),
      ...(query.operator ? { authorId: query.operator } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.followStatus ? { followStatus: query.followStatus } : {}),
      ...(query.tag ? { tags: { some: { tagId: query.tag } } } : {}),
      ...(query.shift ? { shiftInstance: { definitionId: query.shift } } : {}),
      ...(query.from || query.to ? { shiftInstance: { ...(query.shift ? { definitionId: query.shift } : {}), operationalDay: { operationalDate: {
        ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}),
      } } } } : {}),
      ...(query.cursor ? { OR: [
        { createdAt: { lt: query.cursor.createdAt } },
        { createdAt: query.cursor.createdAt, id: { lt: query.cursor.id } },
      ] } : {}),
    };
    const entries = await this.prisma.entry.findMany({
      where,
      include: {
        author: { select: { id: true, displayName: true } },
        shiftInstance: { include: { operationalDay: true } },
        tags: { include: { tag: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.take + 1,
    });
    const hasMore = entries.length > query.take;
    const page = entries.slice(0, query.take);
    const last = page.at(-1);
    return {
      items: page.map((entry) => ({
        entryId: entry.id,
        shiftInstanceId: entry.shiftInstanceId,
        operationalDate: entry.shiftInstance.operationalDay.operationalDate.toISOString().slice(0, 10),
        shiftName: entry.shiftInstance.nameSnapshot,
        author: entry.author,
        createdAt: entry.createdAt,
        type: entry.type,
        followStatus: entry.followStatus,
        plainText: entry.plainText,
        tags: entry.tags.map((item) => ({ id: item.tag.id, name: item.tag.name })),
      })),
      ...(hasMore && last ? { nextCursor: Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString("base64url") } : {}),
    };
  }
}
