import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { validateUuid } from '../../common/utils/uuid-validate';
import { eq } from 'drizzle-orm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '../../platform';
import type { Subject } from '../../shared/api.interface';
import { subject } from '../../database/schema';

const SUBJECTS_CACHE_KEY = 'subjects:all';
const SUBJECTS_TTL = 5 * 60 * 1000;

@Injectable()
export class SubjectsService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async findAll(): Promise<Subject[]> {
    const cached = await this.cacheManager.get<Subject[]>(SUBJECTS_CACHE_KEY);
    if (cached) return cached;

    const rows = await this.db
      .select()
      .from(subject)
      .orderBy(subject.sortOrder, subject.name);
    const result = rows.map((row) => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sortOrder,
      totalKnowledgePoints: row.totalKnowledgePoints,
    }));

    await this.cacheManager.set(SUBJECTS_CACHE_KEY, result, SUBJECTS_TTL);
    return result;
  }

  async findOne(id: string): Promise<Subject> {
    validateUuid(id, '科目ID');
    const rows = await this.db.select().from(subject).where(eq(subject.id, id));
    if (rows.length === 0) throw new NotFoundException('科目不存在');
    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      sortOrder: row.sortOrder,
      totalKnowledgePoints: row.totalKnowledgePoints,
    };
  }
}
