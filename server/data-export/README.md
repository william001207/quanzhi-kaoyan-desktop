# data-export 数据说明

本目录是桌面版**首次启动时自动导入**的业务数据快照（幂等导入：库里已有数据就跳过）。

这些文件**已纳入版本控制**，构建时不需要联网重新导出。
体积约 16MB，GitHub 单文件上限 100MB，直接提交即可，无需 Git LFS。

## 数据口径

| 数据集 | 规模 |
|---|---|
| 真题 `exam_questions` / `exam_question_details` | 1708 道 |
| 知识点 `knowledge_points` / `knowledge_point_details` | 1054 个（另有从真题关联补录的未展开知识点） |
| 章节 `chapter_trees` | 875 个（教材 741 + 考纲 134） |
| 科目 `subjects` | 8 |
| 今日计划 `daily_plan_today` | 80 项（40 知识点 + 40 真题） |
| 设置 `settings` | 1（考试日期 2026-12-19） |
| 模拟卷模板 `mock_templates` | 1（深大模拟卷） |

## 隐私

本快照**不含任何个人学习记录**，已逐字段核验：

- `knowledge_point_details.json`：`masteryScore` / `reviewStage` / `isWeakMarked` / `manuallyPinned` / `lastReviewedAt` 全为空或 0
- `exam_question_details.json`：`answered` / `answerCount` / `masteryScore` 全为空或 0
- `wrong_questions.json`、`review_queue.json`、`mock_records.json` 均为空列表

用户的学习数据（错题、复习记录、模拟卷作答等）由应用运行时写入**用户数据目录**
（macOS：`~/Library/Application Support/全职高手考研系统/pglite-data/`），不在本目录中。

## 更新数据

替换本目录的文件后，**必须**同步修改 `server/database/local-db.ts` 中的：

```ts
const DATA_VERSION = '2026-10-20.1';   // 改成新值，否则应用不会触发增量同步
```

否则应用会认为内容没有变化，继续使用库里的旧数据。

> 增量同步只会 UPDATE 内容字段（`content` / `summary` / `keywords` / `card_data`），
> 不会触碰 `mastery_score` / `status` / `review_*` / `is_weak_marked` 等学习进度字段。

## 重新导出（可选）

`scripts/export_data.py` 用于从线上 API 重新导出全量数据，需要 `EXPORT_TOKEN` 环境变量：

```bash
EXPORT_OUT=$PWD/server/data-export EXPORT_TOKEN=<你的凭证> python3 scripts/export_data.py
```

**日常构建不需要执行它。**

## 追加数据

后续广东多校考研真题与大纲，通过应用内「数据导入」功能追加写入本地库，不必改动本目录。
