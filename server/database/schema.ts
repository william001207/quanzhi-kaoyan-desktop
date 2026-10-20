/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { boolean, date, foreignKey, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const backupWrongQuestionErrorTags20261019 = pgTable("backup_wrong_question_error_tags_20261019", {
  id: uuid("id"),
  questionId: uuid("question_id"),
  knowledgePointId: uuid("knowledge_point_id"),
  firstWrongAt: customTimestamptz("first_wrong_at", { precision: 3 }),
  lastWrongAt: customTimestamptz("last_wrong_at", { precision: 3 }),
  wrongCount: integer("wrong_count"),
  resolved: boolean("resolved"),
  nextRetryAt: customTimestamptz("next_retry_at", { precision: 3 }),
  userAnswer: text("user_answer"),
  mistakeReason: varchar("mistake_reason", { length: 50 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const backupKpTextAudit20261018 = pgTable("backup_kp_text_audit_20261018", {
  id: uuid("id"),
  title: varchar("title", { length: 500 }),
  cardData: jsonb("card_data"),
});

export const backupEqTextAudit20261018 = pgTable("backup_eq_text_audit_20261018", {
  id: uuid("id"),
  questionText: text("question_text"),
  answer: text("answer"),
  cardData: jsonb("card_data"),
});

export const examPaperTemplate = pgTable("exam_paper_template", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  subjectIds: text("subject_ids").array().notNull().default([]),
  source: varchar("source", { length: 255 }),
  yearStart: integer("year_start"),
  yearEnd: integer("year_end"),
  questionTypes: text("question_types").array().notNull().default([]),
  /**
   * @type { noun_explanation?: number, short_answer?: number, essay?: number }
   */
  questionCounts: jsonb("question_counts").notNull().default('{}'),
  /**
   * @type { noun_explanation?: number, short_answer?: number, essay?: number }
   */
  scoreConfig: jsonb("score_config").notNull().default('{}'),
  mode: varchar("mode", { length: 50 }).notNull().default('custom'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_exam_paper_template_created_at").on(table.createdAt),
]);

export const backupExamRecord20261018 = pgTable("backup_exam_record_20261018", {
  id: uuid("id"),
  paperId: uuid("paper_id"),
  title: varchar("title", { length: 255 }),
  totalScore: integer("total_score"),
  earnedScore: numeric("earned_score"),
  totalQuestions: integer("total_questions"),
  startedAt: customTimestamptz("started_at", { precision: 3 }),
  submittedAt: customTimestamptz("submitted_at", { precision: 3 }),
  totalDurationSeconds: integer("total_duration_seconds"),
  status: varchar("status", { length: 50 }),
  answers: jsonb("answers"),
  selfRatings: jsonb("self_ratings"),
  scores: jsonb("scores"),
  addedToWrong: jsonb("added_to_wrong"),
  backupAt: customTimestamptz("backup_at", { precision: 3 }).default(sql`CURRENT_TIMESTAMP`),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const backupExamQuestionGu20261018 = pgTable("backup_exam_question_gu_20261018", {
  id: uuid("id"),
  year: integer("year"),
  subjectId: uuid("subject_id"),
  questionType: varchar("question_type", { length: 50 }),
  questionText: text("question_text"),
  answer: text("answer"),
  answerKeywords: text("answer_keywords").array(),
  source: varchar("source", { length: 255 }),
  notes: text("notes"),
  difficulty: integer("difficulty"),
  cardData: jsonb("card_data"),
  masteryScore: integer("mastery_score"),
  answered: boolean("answered"),
  answerCount: integer("answer_count"),
  lastAnsweredAt: customTimestamptz("last_answered_at", { precision: 3 }),
  backupReason: text("backup_reason"),
  backupAt: customTimestamptz("backup_at", { precision: 3 }).default(sql`CURRENT_TIMESTAMP`),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const backupDeletedQkp20261018GuzheLinchuang = pgTable("backup_deleted_qkp_20261018_guzhe_linchuang", {
  id: uuid("id"),
  questionId: uuid("question_id"),
  knowledgePointId: uuid("knowledge_point_id"),
  relevance: integer("relevance"),
  isPrimary: boolean("is_primary"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
});

export const backupDeletedEq20261018GuzheLinchuang = pgTable("backup_deleted_eq_20261018_guzhe_linchuang", {
  id: uuid("id"),
  year: integer("year"),
  subjectId: uuid("subject_id"),
  questionType: varchar("question_type", { length: 50 }),
  questionText: text("question_text"),
  answer: text("answer"),
  answerKeywords: text("answer_keywords").array(),
  source: varchar("source", { length: 255 }),
  notes: text("notes"),
  difficulty: integer("difficulty"),
  cardData: jsonb("card_data"),
  masteryScore: integer("mastery_score"),
  answered: boolean("answered"),
  answerCount: integer("answer_count"),
  lastAnsweredAt: customTimestamptz("last_answered_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const backupQuestionKnowledgePoint20261018PreP3 = pgTable("backup_question_knowledge_point_20261018_pre_p3", {
  id: uuid("id"),
  questionId: uuid("question_id"),
  knowledgePointId: uuid("knowledge_point_id"),
  relevance: integer("relevance"),
  isPrimary: boolean("is_primary"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
});

export const backupQuestionKnowledgePoint20261018 = pgTable("backup_question_knowledge_point_20261018", {
  id: uuid("id"),
  questionId: uuid("question_id"),
  knowledgePointId: uuid("knowledge_point_id"),
  relevance: integer("relevance"),
  isPrimary: boolean("is_primary"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
});

export const examRecord = pgTable("exam_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  paperId: uuid("paper_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  totalScore: integer("total_score").notNull().default(0),
  earnedScore: numeric("earned_score").notNull().default('0'),
  totalQuestions: integer("total_questions").notNull().default(0),
  startedAt: customTimestamptz("started_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  submittedAt: customTimestamptz("submitted_at", { precision: 3 }),
  totalDurationSeconds: integer("total_duration_seconds").notNull().default(0),
  status: varchar("status", { length: 50 }).notNull().default('in_progress'),
  answers: jsonb("answers").notNull().default('{}'),
  selfRatings: jsonb("self_ratings").notNull().default('{}'),
  scores: jsonb("scores").notNull().default('{}'),
  addedToWrong: jsonb("added_to_wrong").notNull().default('{}'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_exam_record_status").on(table.status),
  index("idx_exam_record_created_at").on(table.createdAt),
  foreignKey({
    columns: [table.paperId],
    foreignColumns: [examPaper.id],
    name: "exam_record_paper_id_fkey",
  }).onDelete("cascade"),
]);

export const examPaper = pgTable("exam_paper", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  mode: varchar("mode", { length: 50 }).notNull().default('custom'),
  subjectIds: text("subject_ids").array().notNull().default([]),
  source: varchar("source", { length: 255 }),
  yearStart: integer("year_start"),
  yearEnd: integer("year_end"),
  questionTypes: text("question_types").array().notNull().default([]),
  questionCounts: jsonb("question_counts").notNull().default('{}'),
  totalScore: integer("total_score").notNull().default(0),
  estimatedMinutes: integer("estimated_minutes").notNull().default(0),
  questionIds: text("question_ids").array().notNull().default([]),
  scoreConfig: jsonb("score_config").notNull().default('{}'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
});

export const backupUserSetting20261017 = pgTable("backup_user_setting_20261017", {
  id: uuid("id"),
  examDate: date("exam_date"),
  dailyMinutes: integer("daily_minutes"),
  maxNewPoints: integer("max_new_points"),
  maxReviews: integer("max_reviews"),
  maxQuestions: integer("max_questions"),
  examMode: boolean("exam_mode"),
  weightSyllabus: integer("weight_syllabus"),
  weightExamFreq: integer("weight_exam_freq"),
  weightMastery: integer("weight_mastery"),
  weightForgetting: integer("weight_forgetting"),
  weightWrong: integer("weight_wrong"),
  weightOverdue: integer("weight_overdue"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const backupDailyPlanItem20261017 = pgTable("backup_daily_plan_item_20261017", {
  id: uuid("id"),
  dailyPlanId: uuid("daily_plan_id"),
  itemType: varchar("item_type", { length: 50 }),
  knowledgePointId: uuid("knowledge_point_id"),
  questionId: uuid("question_id"),
  priorityScore: integer("priority_score"),
  estimatedMinutes: integer("estimated_minutes"),
  completed: boolean("completed"),
  completedAt: customTimestamptz("completed_at", { precision: 3 }),
  sortOrder: integer("sort_order"),
  reason: text("reason"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
});

export const backupDailyPlan20261017 = pgTable("backup_daily_plan_20261017", {
  id: uuid("id"),
  planDate: date("plan_date"),
  generatedAt: customTimestamptz("generated_at", { precision: 3 }),
  status: varchar("status", { length: 50 }),
  totalEstimatedMinutes: integer("total_estimated_minutes"),
  completedMinutes: integer("completed_minutes"),
  totalItems: integer("total_items"),
  completedItems: integer("completed_items"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const backupWrongQuestion20261017 = pgTable("backup_wrong_question_20261017", {
  id: uuid("id"),
  questionId: uuid("question_id"),
  knowledgePointId: uuid("knowledge_point_id"),
  firstWrongAt: customTimestamptz("first_wrong_at", { precision: 3 }),
  lastWrongAt: customTimestamptz("last_wrong_at", { precision: 3 }),
  wrongCount: integer("wrong_count"),
  resolved: boolean("resolved"),
  nextRetryAt: customTimestamptz("next_retry_at", { precision: 3 }),
  userAnswer: text("user_answer"),
  mistakeReason: varchar("mistake_reason", { length: 50 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const backupReviewRecord20261017 = pgTable("backup_review_record_20261017", {
  id: uuid("id"),
  knowledgePointId: uuid("knowledge_point_id"),
  questionId: uuid("question_id"),
  reviewedAt: customTimestamptz("reviewed_at", { precision: 3 }),
  selfRating: varchar("self_rating", { length: 20 }),
  recallScore: integer("recall_score"),
  questionScore: integer("question_score"),
  oldMasteryScore: integer("old_mastery_score"),
  newMasteryScore: integer("new_mastery_score"),
  oldReviewStage: integer("old_review_stage"),
  newReviewStage: integer("new_review_stage"),
  nextReviewAt: customTimestamptz("next_review_at", { precision: 3 }),
  reviewType: varchar("review_type", { length: 50 }),
  notes: text("notes"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const backupStudySession20261017 = pgTable("backup_study_session_20261017", {
  id: uuid("id"),
  knowledgePointId: uuid("knowledge_point_id"),
  questionId: uuid("question_id"),
  sessionType: varchar("session_type", { length: 50 }),
  startedAt: customTimestamptz("started_at", { precision: 3 }),
  completedAt: customTimestamptz("completed_at", { precision: 3 }),
  durationMinutes: integer("duration_minutes"),
  result: varchar("result", { length: 50 }),
  notes: text("notes"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const backupKpTextbookChapter20261017 = pgTable("backup_kp_textbook_chapter_20261017", {
  id: uuid("id"),
  knowledgePointId: uuid("knowledge_point_id"),
  chapterId: uuid("chapter_id"),
  isPrimary: boolean("is_primary"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
});

export const backupQuestionKnowledgePoint20261017 = pgTable("backup_question_knowledge_point_20261017", {
  id: uuid("id"),
  questionId: uuid("question_id"),
  knowledgePointId: uuid("knowledge_point_id"),
  relevance: integer("relevance"),
  isPrimary: boolean("is_primary"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
});

export const backupExamQuestion20261017 = pgTable("backup_exam_question_20261017", {
  id: uuid("id"),
  year: integer("year"),
  subjectId: uuid("subject_id"),
  questionType: varchar("question_type", { length: 50 }),
  questionText: text("question_text"),
  answer: text("answer"),
  answerKeywords: text("answer_keywords").array(),
  source: varchar("source", { length: 255 }),
  notes: text("notes"),
  difficulty: integer("difficulty"),
  cardData: jsonb("card_data"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const backupKnowledgePoint20261017 = pgTable("backup_knowledge_point_20261017", {
  id: uuid("id"),
  subjectId: uuid("subject_id"),
  chapterId: uuid("chapter_id"),
  syllabusItemId: uuid("syllabus_item_id"),
  title: varchar("title", { length: 500 }),
  content: text("content"),
  summary: text("summary"),
  keywords: text("keywords").array(),
  requirementLevel: varchar("requirement_level", { length: 50 }),
  importanceScore: integer("importance_score"),
  examFrequency: integer("exam_frequency"),
  masteryScore: integer("mastery_score"),
  status: varchar("status", { length: 50 }),
  firstLearnedAt: customTimestamptz("first_learned_at", { precision: 3 }),
  lastReviewedAt: customTimestamptz("last_reviewed_at", { precision: 3 }),
  nextReviewAt: customTimestamptz("next_review_at", { precision: 3 }),
  reviewStage: integer("review_stage"),
  consecutiveCorrect: integer("consecutive_correct"),
  consecutiveWrong: integer("consecutive_wrong"),
  totalReviewCount: integer("total_review_count"),
  totalQuestionCount: integer("total_question_count"),
  correctQuestionCount: integer("correct_question_count"),
  manuallyPinned: boolean("manually_pinned"),
  cardData: jsonb("card_data"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const backupSyllabusItem20261017 = pgTable("backup_syllabus_item_20261017", {
  id: uuid("id"),
  subjectId: uuid("subject_id"),
  chapterId: uuid("chapter_id"),
  title: varchar("title", { length: 500 }),
  originalText: text("original_text"),
  requirementLevel: varchar("requirement_level", { length: 50 }),
  source: varchar("source", { length: 255 }),
  sortOrder: integer("sort_order"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const backupChapter20261017 = pgTable("backup_chapter_20261017", {
  id: uuid("id"),
  subjectId: uuid("subject_id"),
  parentChapterId: uuid("parent_chapter_id"),
  title: varchar("title", { length: 500 }),
  sortOrder: integer("sort_order"),
  level: integer("level"),
  source: varchar("source", { length: 50 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const backupSubject20261017 = pgTable("backup_subject_20261017", {
  id: uuid("id"),
  name: varchar("name", { length: 255 }),
  sortOrder: integer("sort_order"),
  totalKnowledgePoints: integer("total_knowledge_points"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const knowledgePointTextbookChapter = pgTable("knowledge_point_textbook_chapter", {
  id: uuid("id").primaryKey().defaultRandom(),
  knowledgePointId: uuid("knowledge_point_id").notNull(),
  chapterId: uuid("chapter_id").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("knowledge_point_textbook_chap_knowledge_point_id_chapter_id_key").on(table.knowledgePointId, table.chapterId),
  index("idx_kptc_kp_id").on(table.knowledgePointId),
  index("idx_kptc_chapter_id").on(table.chapterId),
  foreignKey({
    columns: [table.knowledgePointId],
    foreignColumns: [knowledgePoint.id],
    name: "knowledge_point_textbook_chapter_knowledge_point_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.chapterId],
    foreignColumns: [chapter.id],
    name: "knowledge_point_textbook_chapter_chapter_id_fkey",
  }).onDelete("cascade"),
]);

export const userSetting = pgTable("user_setting", {
  id: uuid("id").primaryKey().defaultRandom(),
  examDate: date("exam_date"),
  dailyMinutes: integer("daily_minutes").notNull().default(300),
  examMode: boolean("exam_mode").notNull().default(false),
  weightSyllabus: integer("weight_syllabus").notNull().default(30),
  weightExamFreq: integer("weight_exam_freq").notNull().default(20),
  weightMastery: integer("weight_mastery").notNull().default(20),
  weightForgetting: integer("weight_forgetting").notNull().default(15),
  weightWrong: integer("weight_wrong").notNull().default(10),
  weightOverdue: integer("weight_overdue").notNull().default(5),
  /**
   * @type { [key: string]: number }
   */
  dailyKpConfig: jsonb("daily_kp_config").notNull().default('{}'),
  /**
   * @type { [key: string]: number }
   */
  dailyQuestionConfig: jsonb("daily_question_config").notNull().default('{}'),
  /**
   * @type { noun_explanation?: number, short_answer?: number, essay?: number }
   */
  mockExamScoreConfig: jsonb("mock_exam_score_config").notNull().default('{}'),
  kpWeightSyllabus: integer("kp_weight_syllabus").notNull().default(30),
  kpWeightExamFreq: integer("kp_weight_exam_freq").notNull().default(20),
  kpWeightMastery: integer("kp_weight_mastery").notNull().default(20),
  kpWeightForgetting: integer("kp_weight_forgetting").notNull().default(15),
  kpWeightWrong: integer("kp_weight_wrong").notNull().default(10),
  kpWeightOverdue: integer("kp_weight_overdue").notNull().default(5),
  qWeightExamFreq: integer("q_weight_exam_freq").notNull().default(30),
  qWeightMastery: integer("q_weight_mastery").notNull().default(25),
  qWeightWrong: integer("q_weight_wrong").notNull().default(20),
  qWeightOverdue: integer("q_weight_overdue").notNull().default(10),
  qWeightDifficulty: integer("q_weight_difficulty").notNull().default(15),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
});

export const wrongQuestion = pgTable("wrong_question", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull(),
  knowledgePointId: uuid("knowledge_point_id"),
  firstWrongAt: customTimestamptz("first_wrong_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  lastWrongAt: customTimestamptz("last_wrong_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  wrongCount: integer("wrong_count").notNull().default(1),
  resolved: boolean("resolved").notNull().default(false),
  nextRetryAt: customTimestamptz("next_retry_at", { precision: 3 }),
  userAnswer: text("user_answer"),
  mistakeReason: varchar("mistake_reason", { length: 50 }),
  errorTags: text("error_tags").array().notNull().default([]),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_wq_question_id").on(table.questionId),
  index("idx_wq_kp_id").on(table.knowledgePointId),
  index("idx_wq_resolved").on(table.resolved),
  index("idx_wq_wrong_count").on(table.wrongCount),
  index("idx_wq_next_retry_at").on(table.nextRetryAt),
  // Complex index: CREATE INDEX idx_wq_created_by ON wrong_question USING btree (((_created_by).user_id)),
  // Complex index: CREATE UNIQUE INDEX wrong_question_user_question_unique ON wrong_question USING btree (((_created_by).user_id), question_id),
  foreignKey({
    columns: [table.questionId],
    foreignColumns: [examQuestion.id],
    name: "wrong_question_question_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.knowledgePointId],
    foreignColumns: [knowledgePoint.id],
    name: "wrong_question_knowledge_point_id_fkey",
  }).onDelete("set null"),
]);

export const dailyPlanItem = pgTable("daily_plan_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  dailyPlanId: uuid("daily_plan_id").notNull(),
  itemType: varchar("item_type", { length: 50 }).notNull(),
  knowledgePointId: uuid("knowledge_point_id"),
  questionId: uuid("question_id"),
  priorityScore: integer("priority_score").notNull().default(0),
  estimatedMinutes: integer("estimated_minutes").notNull().default(15),
  completed: boolean("completed").notNull().default(false),
  completedAt: customTimestamptz("completed_at", { precision: 3 }),
  sortOrder: integer("sort_order").notNull().default(0),
  reason: text("reason"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_dpi_daily_plan_id").on(table.dailyPlanId),
  index("idx_dpi_item_type").on(table.itemType),
  index("idx_dpi_completed").on(table.completed),
  index("idx_dpi_kp_id").on(table.knowledgePointId),
  foreignKey({
    columns: [table.dailyPlanId],
    foreignColumns: [dailyPlan.id],
    name: "daily_plan_item_daily_plan_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.knowledgePointId],
    foreignColumns: [knowledgePoint.id],
    name: "daily_plan_item_knowledge_point_id_fkey",
  }).onDelete("set null"),
  foreignKey({
    columns: [table.questionId],
    foreignColumns: [examQuestion.id],
    name: "daily_plan_item_question_id_fkey",
  }).onDelete("set null"),
]);

export const dailyPlan = pgTable("daily_plan", {
  id: uuid("id").primaryKey().defaultRandom(),
  planDate: date("plan_date").notNull().unique(),
  generatedAt: customTimestamptz("generated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  status: varchar("status", { length: 50 }).notNull().default('active'),
  totalEstimatedMinutes: integer("total_estimated_minutes").notNull().default(0),
  completedMinutes: integer("completed_minutes").notNull().default(0),
  totalItems: integer("total_items").notNull().default(0),
  completedItems: integer("completed_items").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("daily_plan_plan_date_key").on(table.planDate),
  index("idx_dp_plan_date").on(table.planDate),
  index("idx_dp_status").on(table.status),
  // Complex index: CREATE INDEX idx_dp_created_by_plan_date ON daily_plan USING btree (((_created_by).user_id), plan_date),
]);

export const reviewRecord = pgTable("review_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  knowledgePointId: uuid("knowledge_point_id").notNull(),
  questionId: uuid("question_id"),
  reviewedAt: customTimestamptz("reviewed_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  selfRating: varchar("self_rating", { length: 20 }).notNull(),
  recallScore: integer("recall_score"),
  questionScore: integer("question_score"),
  oldMasteryScore: integer("old_mastery_score").notNull(),
  newMasteryScore: integer("new_mastery_score").notNull(),
  oldReviewStage: integer("old_review_stage").notNull(),
  newReviewStage: integer("new_review_stage").notNull(),
  nextReviewAt: customTimestamptz("next_review_at", { precision: 3 }),
  reviewType: varchar("review_type", { length: 50 }).notNull().default('review'),
  notes: text("notes"),
  userAnswer: text("user_answer"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_rr_kp_id").on(table.knowledgePointId),
  index("idx_rr_reviewed_at").on(table.reviewedAt),
  index("idx_rr_self_rating").on(table.selfRating),
  // Complex index: CREATE INDEX idx_rr_created_by ON review_record USING btree (((_created_by).user_id)),
  foreignKey({
    columns: [table.knowledgePointId],
    foreignColumns: [knowledgePoint.id],
    name: "review_record_knowledge_point_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.questionId],
    foreignColumns: [examQuestion.id],
    name: "review_record_question_id_fkey",
  }).onDelete("set null"),
]);

export const studySession = pgTable("study_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  knowledgePointId: uuid("knowledge_point_id"),
  questionId: uuid("question_id"),
  sessionType: varchar("session_type", { length: 50 }).notNull(),
  startedAt: customTimestamptz("started_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: customTimestamptz("completed_at", { precision: 3 }),
  durationMinutes: integer("duration_minutes"),
  result: varchar("result", { length: 50 }),
  notes: text("notes"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_ss_kp_id").on(table.knowledgePointId),
  index("idx_ss_session_type").on(table.sessionType),
  index("idx_ss_started_at").on(table.startedAt),
  // Complex index: CREATE INDEX idx_ss_created_by ON study_session USING btree (((_created_by).user_id)),
  foreignKey({
    columns: [table.knowledgePointId],
    foreignColumns: [knowledgePoint.id],
    name: "study_session_knowledge_point_id_fkey",
  }).onDelete("set null"),
  foreignKey({
    columns: [table.questionId],
    foreignColumns: [examQuestion.id],
    name: "study_session_question_id_fkey",
  }).onDelete("set null"),
]);

export const questionKnowledgePoint = pgTable("question_knowledge_point", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull(),
  knowledgePointId: uuid("knowledge_point_id").notNull(),
  relevance: integer("relevance").notNull().default(5),
  isPrimary: boolean("is_primary").notNull().default(false),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("question_knowledge_point_question_id_knowledge_point_id_key").on(table.questionId, table.knowledgePointId),
  index("idx_qkp_question_id").on(table.questionId),
  index("idx_qkp_knowledge_point_id").on(table.knowledgePointId),
  foreignKey({
    columns: [table.questionId],
    foreignColumns: [examQuestion.id],
    name: "question_knowledge_point_question_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.knowledgePointId],
    foreignColumns: [knowledgePoint.id],
    name: "question_knowledge_point_knowledge_point_id_fkey",
  }).onDelete("cascade"),
]);

export const examQuestion = pgTable("exam_question", {
  id: uuid("id").primaryKey().defaultRandom(),
  year: integer("year").notNull(),
  subjectId: uuid("subject_id").notNull(),
  questionType: varchar("question_type", { length: 50 }).notNull().default('other'),
  questionText: text("question_text").notNull(),
  answer: text("answer"),
  answerKeywords: text("answer_keywords").array().default([]),
  source: varchar("source", { length: 255 }),
  notes: text("notes"),
  difficulty: integer("difficulty").notNull().default(2),
  /**
   * @type { flowSteps?: string[]; blocks?: Array<{ title: string; subtitleEn?: string; content: string }>; summary?: string }
   */
  cardData: jsonb("card_data").notNull().default('{}'),
  masteryScore: integer("mastery_score").notNull().default(0),
  answered: boolean("answered").notNull().default(false),
  answerCount: integer("answer_count").notNull().default(0),
  lastAnsweredAt: customTimestamptz("last_answered_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_eq_year").on(table.year),
  index("idx_eq_subject_id").on(table.subjectId),
  index("idx_eq_question_type").on(table.questionType),
  index("idx_eq_source").on(table.source),
  index("idx_eq_question_text_trgm").using("gin", table.questionText),
  index("idx_eq_answer_trgm").using("gin", table.answer),
  index("idx_eq_source_trgm").using("gin", table.source),
  index("idx_eq_subject_year").on(table.subjectId, table.year),
  index("idx_eq_answered").on(table.answered),
  index("idx_eq_mastery_score").on(table.masteryScore),
  foreignKey({
    columns: [table.subjectId],
    foreignColumns: [subject.id],
    name: "exam_question_subject_id_fkey",
  }).onDelete("cascade"),
]);

export const knowledgePoint = pgTable("knowledge_point", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id").notNull(),
  chapterId: uuid("chapter_id").notNull(),
  syllabusItemId: uuid("syllabus_item_id"),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content"),
  summary: text("summary"),
  keywords: text("keywords").array().default([]),
  requirementLevel: varchar("requirement_level", { length: 50 }).notNull().default('unmarked'),
  importanceScore: integer("importance_score").notNull().default(0),
  examFrequency: integer("exam_frequency").notNull().default(0),
  masteryScore: integer("mastery_score").notNull().default(0),
  status: varchar("status", { length: 50 }).notNull().default('not_started'),
  firstLearnedAt: customTimestamptz("first_learned_at", { precision: 3 }),
  lastReviewedAt: customTimestamptz("last_reviewed_at", { precision: 3 }),
  nextReviewAt: customTimestamptz("next_review_at", { precision: 3 }),
  reviewStage: integer("review_stage").notNull().default(0),
  consecutiveCorrect: integer("consecutive_correct").notNull().default(0),
  consecutiveWrong: integer("consecutive_wrong").notNull().default(0),
  totalReviewCount: integer("total_review_count").notNull().default(0),
  totalQuestionCount: integer("total_question_count").notNull().default(0),
  correctQuestionCount: integer("correct_question_count").notNull().default(0),
  manuallyPinned: boolean("manually_pinned").notNull().default(false),
  /**
   * @type { flowSteps?: string[]; blocks?: Array<{ title: string; subtitleEn?: string; content: string }>; summary?: string }
   */
  cardData: jsonb("card_data").notNull().default('{}'),
  isWeakMarked: boolean("is_weak_marked").notNull().default(false),
  weakMarkedAt: customTimestamptz("weak_marked_at", { precision: 3 }),
  weakMarkReason: varchar("weak_mark_reason", { length: 100 }),
  recallMastery: integer("recall_mastery").notNull().default(0),
  questionMastery: integer("question_mastery").notNull().default(0),
  answeredQuestionCount: integer("answered_question_count").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_kp_subject_id").on(table.subjectId),
  index("idx_kp_chapter_id").on(table.chapterId),
  index("idx_kp_syllabus_item_id").on(table.syllabusItemId),
  index("idx_kp_status").on(table.status),
  index("idx_kp_mastery_score").on(table.masteryScore),
  index("idx_kp_next_review_at").on(table.nextReviewAt),
  index("idx_kp_exam_frequency").on(table.examFrequency),
  index("idx_kp_title_trgm").using("gin", table.title),
  index("idx_kp_summary_trgm").using("gin", table.summary),
  index("idx_kp_weak_marked").on(table.isWeakMarked),
  index("idx_kp_recall_mastery").on(table.recallMastery),
  index("idx_kp_question_mastery").on(table.questionMastery),
  foreignKey({
    columns: [table.subjectId],
    foreignColumns: [subject.id],
    name: "knowledge_point_subject_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.chapterId],
    foreignColumns: [chapter.id],
    name: "knowledge_point_chapter_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.syllabusItemId],
    foreignColumns: [syllabusItem.id],
    name: "knowledge_point_syllabus_item_id_fkey",
  }).onDelete("set null"),
]);

export const syllabusItem = pgTable("syllabus_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id").notNull(),
  chapterId: uuid("chapter_id").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  originalText: text("original_text"),
  requirementLevel: varchar("requirement_level", { length: 50 }).notNull().default('unmarked'),
  source: varchar("source", { length: 255 }),
  sortOrder: integer("sort_order").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_syllabus_subject_id").on(table.subjectId),
  index("idx_syllabus_chapter_id").on(table.chapterId),
  index("idx_syllabus_title_trgm").using("gin", table.title),
  foreignKey({
    columns: [table.subjectId],
    foreignColumns: [subject.id],
    name: "syllabus_item_subject_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.chapterId],
    foreignColumns: [chapter.id],
    name: "syllabus_item_chapter_id_fkey",
  }).onDelete("cascade"),
]);

export const chapter = pgTable("chapter", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id").notNull(),
  parentChapterId: uuid("parent_chapter_id"),
  title: varchar("title", { length: 500 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  level: integer("level").notNull().default(1),
  source: varchar("source", { length: 50 }).notNull().default('exam_syllabus'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_chapter_subject_id").on(table.subjectId),
  index("idx_chapter_parent_chapter_id").on(table.parentChapterId),
  index("idx_chapter_title_trgm").using("gin", table.title),
  index("idx_chapter_subject_source").on(table.subjectId, table.source),
  foreignKey({
    columns: [table.subjectId],
    foreignColumns: [subject.id],
    name: "chapter_subject_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.parentChapterId],
    foreignColumns: [chapter.id],
    name: "chapter_parent_chapter_id_fkey",
  }).onDelete("cascade"),
]);

export const subject = pgTable("subject", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  totalKnowledgePoints: integer("total_knowledge_points").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
});

// table aliases
export const backupChapter20261017Table = backupChapter20261017;
export const backupDailyPlan20261017Table = backupDailyPlan20261017;
export const backupDailyPlanItem20261017Table = backupDailyPlanItem20261017;
export const backupDeletedEq20261018GuzheLinchuangTable = backupDeletedEq20261018GuzheLinchuang;
export const backupDeletedQkp20261018GuzheLinchuangTable = backupDeletedQkp20261018GuzheLinchuang;
export const backupEqTextAudit20261018Table = backupEqTextAudit20261018;
export const backupExamQuestion20261017Table = backupExamQuestion20261017;
export const backupExamQuestionGu20261018Table = backupExamQuestionGu20261018;
export const backupExamRecord20261018Table = backupExamRecord20261018;
export const backupKnowledgePoint20261017Table = backupKnowledgePoint20261017;
export const backupKpTextAudit20261018Table = backupKpTextAudit20261018;
export const backupKpTextbookChapter20261017Table = backupKpTextbookChapter20261017;
export const backupQuestionKnowledgePoint20261017Table = backupQuestionKnowledgePoint20261017;
export const backupQuestionKnowledgePoint20261018Table = backupQuestionKnowledgePoint20261018;
export const backupQuestionKnowledgePoint20261018PreP3Table = backupQuestionKnowledgePoint20261018PreP3;
export const backupReviewRecord20261017Table = backupReviewRecord20261017;
export const backupStudySession20261017Table = backupStudySession20261017;
export const backupSubject20261017Table = backupSubject20261017;
export const backupSyllabusItem20261017Table = backupSyllabusItem20261017;
export const backupUserSetting20261017Table = backupUserSetting20261017;
export const backupWrongQuestion20261017Table = backupWrongQuestion20261017;
export const backupWrongQuestionErrorTags20261019Table = backupWrongQuestionErrorTags20261019;
export const chapterTable = chapter;
export const dailyPlanTable = dailyPlan;
export const dailyPlanItemTable = dailyPlanItem;
export const examPaperTable = examPaper;
export const examPaperTemplateTable = examPaperTemplate;
export const examQuestionTable = examQuestion;
export const examRecordTable = examRecord;
export const knowledgePointTable = knowledgePoint;
export const knowledgePointTextbookChapterTable = knowledgePointTextbookChapter;
export const questionKnowledgePointTable = questionKnowledgePoint;
export const reviewRecordTable = reviewRecord;
export const studySessionTable = studySession;
export const subjectTable = subject;
export const syllabusItemTable = syllabusItem;
export const userSettingTable = userSetting;
export const wrongQuestionTable = wrongQuestion;
