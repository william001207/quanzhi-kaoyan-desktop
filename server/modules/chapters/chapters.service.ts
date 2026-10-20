import { Inject, Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { and, eq, isNull, count, gte, lte, sql } from 'drizzle-orm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '../../platform';
import type { Chapter, SyllabusMode } from '../../shared/api.interface';
import { chapter, knowledgePoint } from '../../database/schema';
import { validateUuid } from '../../common/utils/uuid-validate';
import { CreateChapterDto, UpdateChapterDto } from './dto/chapters.dto';

const TREE_CACHE_TTL = 10 * 60 * 1000;
const treeCacheKey = (subjectId: string, source: string) => `chapters:tree:${source}:${subjectId}`;

export interface ChapterTree extends Chapter {
  children: ChapterTree[];
}

@Injectable()
export class ChaptersService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async findBySubject(
    subjectId: string,
    source: SyllabusMode = 'exam_syllabus',
  ): Promise<Chapter[]> {
    validateUuid(subjectId, '科目ID');
    const rows = await this.db
      .select()
      .from(chapter)
      .where(and(eq(chapter.subjectId, subjectId), eq(chapter.source, source)))
      .orderBy(chapter.level, chapter.sortOrder, chapter.title);
    return rows.map((row) => this.toChapter(row));
  }

  async findTree(
    subjectId: string,
    source: SyllabusMode = 'exam_syllabus',
  ): Promise<ChapterTree[]> {
    validateUuid(subjectId, '科目ID');
    const key = treeCacheKey(subjectId, source);
    const cached = await this.cacheManager.get<ChapterTree[]>(key);
    if (cached) return cached;

    const rows = await this.db
      .select()
      .from(chapter)
      .where(and(eq(chapter.subjectId, subjectId), eq(chapter.source, source)))
      .orderBy(chapter.level, chapter.sortOrder, chapter.title);

    const all = rows.map((row) => this.toChapter(row));
    const byParent = new Map<string | null, ChapterTree[]>();

    for (const c of all) {
      const key2: string | null = c.parentChapterId ?? null;
      const node: ChapterTree = { ...c, children: [] };
      const list = byParent.get(key2) ?? [];
      list.push(node);
      byParent.set(key2, list);
    }

    const mapById = new Map<string, ChapterTree>();
    for (const list of byParent.values()) {
      for (const n of list) mapById.set(n.id, n);
    }
    for (const c of all) {
      if (c.parentChapterId) {
        const parent = mapById.get(c.parentChapterId);
        const node = mapById.get(c.id);
        if (parent && node && !parent.children.some((ch) => ch.id === node.id)) {
          parent.children.push(node);
        }
      }
    }

    const result = byParent.get(null) ?? [];
    await this.cacheManager.set(key, result, TREE_CACHE_TTL);
    return result;
  }

  async create(dto: CreateChapterDto): Promise<Chapter> {
    validateUuid(dto.subjectId, '科目ID');
    const source: SyllabusMode = (dto.source ?? 'exam_syllabus') as SyllabusMode;
    const parentId = dto.parentChapterId ?? null;

    let parentLevel = 0;
    if (parentId) {
      validateUuid(parentId, '父章节ID');
      const parentRows = await this.db
        .select({ level: chapter.level })
        .from(chapter)
        .where(eq(chapter.id, parentId));
      if (parentRows.length === 0) throw new NotFoundException('父章节不存在');
      parentLevel = parentRows[0].level;
    }

    const maxResult = await this.db
      .select({ max: sql<number>`coalesce(max(${chapter.sortOrder}), -1)` })
      .from(chapter)
      .where(
        and(
          eq(chapter.subjectId, dto.subjectId),
          eq(chapter.source, source),
          parentId ? eq(chapter.parentChapterId, parentId) : isNull(chapter.parentChapterId),
        ),
      );
    const nextSortOrder = (maxResult[0]?.max ?? -1) + 1;

    const inserted = await this.db
      .insert(chapter)
      .values({
        title: dto.title.trim(),
        subjectId: dto.subjectId,
        parentChapterId: parentId,
        level: parentLevel + 1,
        sortOrder: nextSortOrder,
        source,
      })
      .returning();

    await this.invalidateTreeCache(dto.subjectId, source);
    return this.toChapter(inserted[0]);
  }

  async update(id: string, dto: UpdateChapterDto): Promise<Chapter> {
    validateUuid(id, '章节ID');
    if (dto.title === undefined && dto.sortOrder === undefined) {
      throw new BadRequestException('未提供可更新字段');
    }

    const patch: Partial<typeof chapter.$inferInsert> = {};
    if (dto.title !== undefined) patch.title = dto.title.trim();
    if (dto.sortOrder !== undefined) patch.sortOrder = dto.sortOrder;

    const updated = await this.db
      .update(chapter)
      .set(patch)
      .where(eq(chapter.id, id))
      .returning();

    if (updated.length === 0) throw new NotFoundException('章节不存在');

    const row = updated[0];
    await this.invalidateTreeCache(row.subjectId, row.source);
    return this.toChapter(row);
  }

  async move(id: string, direction: 'up' | 'down'): Promise<Chapter> {
    validateUuid(id, '章节ID');
    const rows = await this.db.select().from(chapter).where(eq(chapter.id, id));
    if (rows.length === 0) throw new NotFoundException('章节不存在');
    const current = rows[0];

    const siblings = await this.db
      .select({ id: chapter.id, sortOrder: chapter.sortOrder })
      .from(chapter)
      .where(
        and(
          eq(chapter.subjectId, current.subjectId),
          eq(chapter.source, current.source),
          current.parentChapterId
            ? eq(chapter.parentChapterId, current.parentChapterId)
            : isNull(chapter.parentChapterId),
        ),
      )
      .orderBy(chapter.sortOrder, chapter.id);

    const idx = siblings.findIndex((s) => s.id === id);
    if (idx === -1) throw new NotFoundException('章节不存在');

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) {
      throw new ConflictException(direction === 'up' ? '已经是第一个' : '已经是最后一个');
    }

    const target = siblings[swapIdx];
    await this.db.transaction(async (tx) => {
      await tx.update(chapter).set({ sortOrder: target.sortOrder }).where(eq(chapter.id, id));
      await tx.update(chapter).set({ sortOrder: current.sortOrder }).where(eq(chapter.id, target.id));
    });

    await this.invalidateTreeCache(current.subjectId, current.source);
    const updatedRows = await this.db.select().from(chapter).where(eq(chapter.id, id));
    return this.toChapter(updatedRows[0]);
  }

  async remove(id: string): Promise<void> {
    validateUuid(id, '章节ID');
    const rows = await this.db.select().from(chapter).where(eq(chapter.id, id));
    if (rows.length === 0) throw new NotFoundException('章节不存在');
    const target = rows[0];

    const childCountResult = await this.db
      .select({ count: count() })
      .from(chapter)
      .where(eq(chapter.parentChapterId, id));
    const childCount = childCountResult[0]?.count ?? 0;

    const kpCountResult = await this.db
      .select({ count: count() })
      .from(knowledgePoint)
      .where(eq(knowledgePoint.chapterId, id));
    const kpCount = kpCountResult[0]?.count ?? 0;

    if (childCount > 0 || kpCount > 0) {
      throw new ConflictException(
        `该章节下有 ${childCount} 个子章节和 ${kpCount} 个知识点，清空后才能删除`,
      );
    }

    await this.db.delete(chapter).where(eq(chapter.id, id));
    await this.invalidateTreeCache(target.subjectId, target.source);
  }

  private async invalidateTreeCache(subjectId: string, source: string): Promise<void> {
    const key = treeCacheKey(subjectId, source);
    await this.cacheManager.del(key);
  }

  private toChapter(row: typeof chapter.$inferSelect): Chapter {
    return {
      id: row.id,
      subjectId: row.subjectId,
      parentChapterId: row.parentChapterId,
      title: row.title,
      sortOrder: row.sortOrder,
      level: row.level,
      source: row.source as SyllabusMode,
    };
  }
}
