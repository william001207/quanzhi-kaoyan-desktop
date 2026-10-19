# data-export 数据说明

本目录为桌面版首次启动时自动导入的业务数据快照（幂等导入：库中已有数据则跳过）。

## 数据口径

| 数据集 | 规模 |
|---|---|
| 真题 exam_questions / exam_question_details | 1708 道 |
| 知识点 knowledge_points / knowledge_point_details | 1123 个 |
| 章节 chapter_trees / chapters | 875 个（教材 741 + 考纲 134） |
| 科目 subjects | 8 |
| 今日计划 daily_plan_today | 80 项（40 知识点 + 40 真题，2026-10-20） |
| 设置 settings | 1（考试日期 2026-12-19） |
| 模拟卷模板 mock_templates | 1（深大模拟卷） |

## 文件说明

- 大文件（exam_question_details.json 8MB、knowledge_point_details.json 5.8MB、knowledge_points.json 1.5MB、exam_questions.json 732KB、chapter_trees.json 292KB）因体积未纳入本开源仓库的 git 提交；
- 重新生成完整数据：运行 `desktop-source/export_data.py`（线上 API 导出脚本）或从桌面安装包 `release/` 内的 `resources/server/data-export/` 提取；
- 用户学习数据（错题、复习记录、模拟卷作答等）由应用运行时写入用户数据目录，不在此快照中。

## 追加数据

后续广东多校考研真题与大纲，可通过应用内「数据导入」功能追加写入本地库。
