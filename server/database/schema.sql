-- 全职高手考研系统 桌面版本地建表 DDL（PGlite）
-- 与线上 schema.ts 核心业务表保持一致；移除 pg_trgm GIN 索引（PGlite 不支持，模糊搜索走 ILIKE）
-- 不包含 backup_* 维护表（线上数据修复留档用，非业务功能）

DO $$ BEGIN
  CREATE TYPE user_profile AS (
    user_id text,
    name text,
    email text,
    avatar_url text
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS subject (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  total_knowledge_points integer NOT NULL DEFAULT 0,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);

CREATE TABLE IF NOT EXISTS chapter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  parent_chapter_id uuid REFERENCES chapter(id) ON DELETE CASCADE,
  title varchar(500) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  source varchar(50) NOT NULL DEFAULT 'exam_syllabus',
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE INDEX IF NOT EXISTS idx_chapter_subject_id ON chapter(subject_id);
CREATE INDEX IF NOT EXISTS idx_chapter_parent_chapter_id ON chapter(parent_chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapter_subject_source ON chapter(subject_id, source);

CREATE TABLE IF NOT EXISTS syllabus_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES chapter(id) ON DELETE CASCADE,
  title varchar(500) NOT NULL,
  original_text text,
  requirement_level varchar(50) NOT NULL DEFAULT 'unmarked',
  source varchar(255),
  sort_order integer NOT NULL DEFAULT 0,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE INDEX IF NOT EXISTS idx_syllabus_subject_id ON syllabus_item(subject_id);
CREATE INDEX IF NOT EXISTS idx_syllabus_chapter_id ON syllabus_item(chapter_id);

CREATE TABLE IF NOT EXISTS knowledge_point (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES chapter(id) ON DELETE CASCADE,
  syllabus_item_id uuid REFERENCES syllabus_item(id) ON DELETE SET NULL,
  title varchar(500) NOT NULL,
  content text,
  summary text,
  keywords text[] DEFAULT '{}',
  requirement_level varchar(50) NOT NULL DEFAULT 'unmarked',
  importance_score integer NOT NULL DEFAULT 0,
  exam_frequency integer NOT NULL DEFAULT 0,
  mastery_score integer NOT NULL DEFAULT 0,
  status varchar(50) NOT NULL DEFAULT 'not_started',
  first_learned_at timestamptz(3),
  last_reviewed_at timestamptz(3),
  next_review_at timestamptz(3),
  review_stage integer NOT NULL DEFAULT 0,
  consecutive_correct integer NOT NULL DEFAULT 0,
  consecutive_wrong integer NOT NULL DEFAULT 0,
  total_review_count integer NOT NULL DEFAULT 0,
  total_question_count integer NOT NULL DEFAULT 0,
  correct_question_count integer NOT NULL DEFAULT 0,
  manually_pinned boolean NOT NULL DEFAULT false,
  card_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_weak_marked boolean NOT NULL DEFAULT false,
  weak_marked_at timestamptz(3),
  weak_mark_reason varchar(100),
  recall_mastery integer NOT NULL DEFAULT 0,
  question_mastery integer NOT NULL DEFAULT 0,
  answered_question_count integer NOT NULL DEFAULT 0,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE INDEX IF NOT EXISTS idx_kp_subject_id ON knowledge_point(subject_id);
CREATE INDEX IF NOT EXISTS idx_kp_chapter_id ON knowledge_point(chapter_id);
CREATE INDEX IF NOT EXISTS idx_kp_syllabus_item_id ON knowledge_point(syllabus_item_id);
CREATE INDEX IF NOT EXISTS idx_kp_status ON knowledge_point(status);
CREATE INDEX IF NOT EXISTS idx_kp_mastery_score ON knowledge_point(mastery_score);
CREATE INDEX IF NOT EXISTS idx_kp_next_review_at ON knowledge_point(next_review_at);
CREATE INDEX IF NOT EXISTS idx_kp_exam_frequency ON knowledge_point(exam_frequency);
CREATE INDEX IF NOT EXISTS idx_kp_weak_marked ON knowledge_point(is_weak_marked);
CREATE INDEX IF NOT EXISTS idx_kp_recall_mastery ON knowledge_point(recall_mastery);
CREATE INDEX IF NOT EXISTS idx_kp_question_mastery ON knowledge_point(question_mastery);

CREATE TABLE IF NOT EXISTS exam_question (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  subject_id uuid NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  question_type varchar(50) NOT NULL DEFAULT 'other',
  question_text text NOT NULL,
  answer text,
  answer_keywords text[] DEFAULT '{}',
  source varchar(255),
  notes text,
  difficulty integer NOT NULL DEFAULT 2,
  card_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  mastery_score integer NOT NULL DEFAULT 0,
  answered boolean NOT NULL DEFAULT false,
  answer_count integer NOT NULL DEFAULT 0,
  last_answered_at timestamptz(3),
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE INDEX IF NOT EXISTS idx_eq_year ON exam_question(year);
CREATE INDEX IF NOT EXISTS idx_eq_subject_id ON exam_question(subject_id);
CREATE INDEX IF NOT EXISTS idx_eq_question_type ON exam_question(question_type);
CREATE INDEX IF NOT EXISTS idx_eq_source ON exam_question(source);
CREATE INDEX IF NOT EXISTS idx_eq_subject_year ON exam_question(subject_id, year);
CREATE INDEX IF NOT EXISTS idx_eq_answered ON exam_question(answered);
CREATE INDEX IF NOT EXISTS idx_eq_mastery_score ON exam_question(mastery_score);

CREATE TABLE IF NOT EXISTS question_knowledge_point (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES exam_question(id) ON DELETE CASCADE,
  knowledge_point_id uuid NOT NULL REFERENCES knowledge_point(id) ON DELETE CASCADE,
  relevance integer NOT NULL DEFAULT 5,
  is_primary boolean NOT NULL DEFAULT false,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (question_id, knowledge_point_id)
);
CREATE INDEX IF NOT EXISTS idx_qkp_question_id ON question_knowledge_point(question_id);
CREATE INDEX IF NOT EXISTS idx_qkp_knowledge_point_id ON question_knowledge_point(knowledge_point_id);

CREATE TABLE IF NOT EXISTS knowledge_point_textbook_chapter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_point_id uuid NOT NULL REFERENCES knowledge_point(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES chapter(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (knowledge_point_id, chapter_id)
);
CREATE INDEX IF NOT EXISTS idx_kptc_kp_id ON knowledge_point_textbook_chapter(knowledge_point_id);
CREATE INDEX IF NOT EXISTS idx_kptc_chapter_id ON knowledge_point_textbook_chapter(chapter_id);

CREATE TABLE IF NOT EXISTS user_setting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_date date,
  daily_minutes integer NOT NULL DEFAULT 300,
  exam_mode boolean NOT NULL DEFAULT false,
  weight_syllabus integer NOT NULL DEFAULT 30,
  weight_exam_freq integer NOT NULL DEFAULT 20,
  weight_mastery integer NOT NULL DEFAULT 20,
  weight_forgetting integer NOT NULL DEFAULT 15,
  weight_wrong integer NOT NULL DEFAULT 10,
  weight_overdue integer NOT NULL DEFAULT 5,
  daily_kp_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  daily_question_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  mock_exam_score_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  kp_weight_syllabus integer NOT NULL DEFAULT 30,
  kp_weight_exam_freq integer NOT NULL DEFAULT 20,
  kp_weight_mastery integer NOT NULL DEFAULT 20,
  kp_weight_forgetting integer NOT NULL DEFAULT 15,
  kp_weight_wrong integer NOT NULL DEFAULT 10,
  kp_weight_overdue integer NOT NULL DEFAULT 5,
  q_weight_exam_freq integer NOT NULL DEFAULT 30,
  q_weight_mastery integer NOT NULL DEFAULT 25,
  q_weight_wrong integer NOT NULL DEFAULT 20,
  q_weight_overdue integer NOT NULL DEFAULT 10,
  q_weight_difficulty integer NOT NULL DEFAULT 15,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);

CREATE TABLE IF NOT EXISTS wrong_question (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES exam_question(id) ON DELETE CASCADE,
  knowledge_point_id uuid REFERENCES knowledge_point(id) ON DELETE SET NULL,
  first_wrong_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_wrong_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  wrong_count integer NOT NULL DEFAULT 1,
  resolved boolean NOT NULL DEFAULT false,
  next_retry_at timestamptz(3),
  user_answer text,
  mistake_reason varchar(50),
  error_tags text[] NOT NULL DEFAULT '{}',
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE INDEX IF NOT EXISTS idx_wq_question_id ON wrong_question(question_id);
CREATE INDEX IF NOT EXISTS idx_wq_kp_id ON wrong_question(knowledge_point_id);
CREATE INDEX IF NOT EXISTS idx_wq_resolved ON wrong_question(resolved);
CREATE INDEX IF NOT EXISTS idx_wq_wrong_count ON wrong_question(wrong_count);
CREATE INDEX IF NOT EXISTS idx_wq_next_retry_at ON wrong_question(next_retry_at);

CREATE TABLE IF NOT EXISTS daily_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_date date NOT NULL UNIQUE,
  generated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status varchar(50) NOT NULL DEFAULT 'active',
  total_estimated_minutes integer NOT NULL DEFAULT 0,
  completed_minutes integer NOT NULL DEFAULT 0,
  total_items integer NOT NULL DEFAULT 0,
  completed_items integer NOT NULL DEFAULT 0,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE INDEX IF NOT EXISTS idx_dp_plan_date ON daily_plan(plan_date);
CREATE INDEX IF NOT EXISTS idx_dp_status ON daily_plan(status);

CREATE TABLE IF NOT EXISTS daily_plan_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_plan_id uuid NOT NULL REFERENCES daily_plan(id) ON DELETE CASCADE,
  item_type varchar(50) NOT NULL,
  knowledge_point_id uuid REFERENCES knowledge_point(id) ON DELETE SET NULL,
  question_id uuid REFERENCES exam_question(id) ON DELETE SET NULL,
  priority_score integer NOT NULL DEFAULT 0,
  estimated_minutes integer NOT NULL DEFAULT 15,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz(3),
  sort_order integer NOT NULL DEFAULT 0,
  reason text,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dpi_daily_plan_id ON daily_plan_item(daily_plan_id);
CREATE INDEX IF NOT EXISTS idx_dpi_item_type ON daily_plan_item(item_type);
CREATE INDEX IF NOT EXISTS idx_dpi_completed ON daily_plan_item(completed);
CREATE INDEX IF NOT EXISTS idx_dpi_kp_id ON daily_plan_item(knowledge_point_id);

CREATE TABLE IF NOT EXISTS review_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_point_id uuid NOT NULL REFERENCES knowledge_point(id) ON DELETE CASCADE,
  question_id uuid REFERENCES exam_question(id) ON DELETE SET NULL,
  reviewed_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  self_rating varchar(20) NOT NULL,
  recall_score integer,
  question_score integer,
  old_mastery_score integer NOT NULL,
  new_mastery_score integer NOT NULL,
  old_review_stage integer NOT NULL,
  new_review_stage integer NOT NULL,
  next_review_at timestamptz(3),
  review_type varchar(50) NOT NULL DEFAULT 'review',
  notes text,
  user_answer text,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE INDEX IF NOT EXISTS idx_rr_kp_id ON review_record(knowledge_point_id);
CREATE INDEX IF NOT EXISTS idx_rr_reviewed_at ON review_record(reviewed_at);
CREATE INDEX IF NOT EXISTS idx_rr_self_rating ON review_record(self_rating);

CREATE TABLE IF NOT EXISTS study_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_point_id uuid REFERENCES knowledge_point(id) ON DELETE SET NULL,
  question_id uuid REFERENCES exam_question(id) ON DELETE SET NULL,
  session_type varchar(50) NOT NULL,
  started_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz(3),
  duration_minutes integer,
  result varchar(50),
  notes text,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE INDEX IF NOT EXISTS idx_ss_kp_id ON study_session(knowledge_point_id);
CREATE INDEX IF NOT EXISTS idx_ss_session_type ON study_session(session_type);
CREATE INDEX IF NOT EXISTS idx_ss_started_at ON study_session(started_at);

CREATE TABLE IF NOT EXISTS exam_paper_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  subject_ids text[] NOT NULL DEFAULT '{}',
  source varchar(255),
  year_start integer,
  year_end integer,
  question_types text[] NOT NULL DEFAULT '{}',
  question_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode varchar(50) NOT NULL DEFAULT 'custom',
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE INDEX IF NOT EXISTS idx_exam_paper_template_created_at ON exam_paper_template(_created_at);

CREATE TABLE IF NOT EXISTS exam_paper (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(255) NOT NULL,
  mode varchar(50) NOT NULL DEFAULT 'custom',
  subject_ids text[] NOT NULL DEFAULT '{}',
  source varchar(255),
  year_start integer,
  year_end integer,
  question_types text[] NOT NULL DEFAULT '{}',
  question_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_score integer NOT NULL DEFAULT 0,
  estimated_minutes integer NOT NULL DEFAULT 0,
  question_ids text[] NOT NULL DEFAULT '{}',
  score_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);

CREATE TABLE IF NOT EXISTS exam_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id uuid NOT NULL REFERENCES exam_paper(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  total_score integer NOT NULL DEFAULT 0,
  earned_score numeric NOT NULL DEFAULT 0,
  total_questions integer NOT NULL DEFAULT 0,
  started_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at timestamptz(3),
  total_duration_seconds integer NOT NULL DEFAULT 0,
  status varchar(50) NOT NULL DEFAULT 'in_progress',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  self_ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  added_to_wrong jsonb NOT NULL DEFAULT '{}'::jsonb,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile,
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile
);
CREATE INDEX IF NOT EXISTS idx_exam_record_status ON exam_record(status);
CREATE INDEX IF NOT EXISTS idx_exam_record_created_at ON exam_record(_created_at);

-- 应用元信息（数据版本等）
CREATE TABLE IF NOT EXISTS app_meta (
  key varchar(100) PRIMARY KEY,
  value text NOT NULL
);
