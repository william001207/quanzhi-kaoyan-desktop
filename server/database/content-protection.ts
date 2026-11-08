import { isDeepStrictEqual } from 'node:util';
const KEY = 'official_content_baseline_v1';
const fields = {
  exam_question: ['year','subject_id','question_type','question_text','answer','answer_keywords','source','notes','difficulty','card_data'],
  knowledge_point: ['subject_id','chapter_id','syllabus_item_id','title','requirement_level','importance_score','exam_frequency','card_data'],
};
const rows = (r: any) => r.rows ?? r;
export function officialBaseline(questions: any, points: any) {
  return {
    question_links: Object.fromEntries(Object.values(questions).map((q:any)=>[q.id,
      (q.knowledgePoints ?? []).map((p:any)=>({knowledge_point_id:p.id,relevance:p.relevance ?? 5,is_primary:p.isPrimary ?? false})).sort((a:any,b:any)=>a.knowledge_point_id.localeCompare(b.knowledge_point_id))])),
    exam_question: Object.fromEntries(Object.values(questions).map((q: any) => [q.id, {
      year:q.year,subject_id:q.subjectId,question_type:q.questionType ?? 'other',question_text:q.questionText,
      answer:q.answer ?? null,answer_keywords:q.answerKeywords ?? [],source:q.source ?? null,notes:q.notes ?? null,
      difficulty:q.difficulty ?? 2,card_data:q.cardData ?? {},
    }])),
    knowledge_point: Object.fromEntries(Object.values(points).map((p: any) => [p.id, {
      subject_id:p.subjectId,chapter_id:p.chapterId,syllabus_item_id:p.syllabusItemId ?? null,title:p.title,
      requirement_level:p.requirementLevel ?? 'unmarked',importance_score:p.importanceScore ?? 0,
      exam_frequency:p.examFrequency ?? 0,card_data:p.cardData ?? {},
    }])),
  };
}
export async function seedContentBaseline(db: any, baseline: any) {
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING', [KEY,JSON.stringify(baseline)]);
}
/** Caller supplies a transaction: restore only fields changed from the last official baseline. */
export async function protectContentSync(db: any, baseline: any, sync: () => Promise<void>) {
  const saved = rows(await db.query('SELECT value FROM app_meta WHERE key=$1',[KEY]))[0];
  const previous = saved ? JSON.parse(saved.value) : {};
  const edits: Array<{table:string;id:string;values:Record<string,any>}> = [];
  for (const [table, columns] of Object.entries(fields)) {
    for (const record of rows(await db.query(`SELECT id,${columns.join(',')} FROM ${table}`))) {
      const base = previous[table]?.[record.id];
      const values: Record<string,any> = {};
      for (const column of columns) {
        // Unknown baseline (old/skipped versions or personal rows): preserve conservatively.
        if (!base || !isDeepStrictEqual(record[column],base[column])) values[column]=record[column];
      }
      if (Object.keys(values).length) edits.push({table,id:record.id,values});
    }
  }
  const links = rows(await db.query('SELECT question_id,knowledge_point_id,relevance,is_primary FROM question_knowledge_point'));
  const linkEdits = new Map<string,any[]>();
  for (const question of rows(await db.query('SELECT id FROM exam_question'))) {
    const current = links.filter((r:any)=>r.question_id===question.id).map(({question_id,...r}:any)=>r)
      .sort((a:any,b:any)=>a.knowledge_point_id.localeCompare(b.knowledge_point_id));
    if (!isDeepStrictEqual(current,previous.question_links?.[question.id])) linkEdits.set(question.id,current);
  }
  await sync();
  for (const [id, savedLinks] of linkEdits) {
    await db.query('DELETE FROM question_knowledge_point WHERE question_id=$1',[id]);
    for (const link of savedLinks) await db.query('INSERT INTO question_knowledge_point(question_id,knowledge_point_id,relevance,is_primary) VALUES($1,$2,$3,$4)',[id,link.knowledge_point_id,link.relevance,link.is_primary]);
  }
  for (const edit of edits) {
    const columns = Object.keys(edit.values);
    await db.query(`UPDATE ${edit.table} SET ${columns.map((c,i)=>`${c}=$${i+2}`).join(',')} WHERE id=$1`,
      [edit.id,...columns.map(c=>c==='card_data' ? JSON.stringify(edit.values[c]) : edit.values[c])]);
  }
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [KEY,JSON.stringify(baseline)]);
}
