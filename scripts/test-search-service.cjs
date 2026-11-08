// Run after npm run build:server. Uses production schema and service, in memory only.
const { PGlite } = require('../server/node_modules/@electric-sql/pglite');
const { drizzle } = require('../server/node_modules/drizzle-orm/pglite');
const { ExamQuestionsService } = require('../server/dist/modules/exam-questions/exam-questions.service');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const pg = new PGlite();
  try {
    await pg.exec(fs.readFileSync('server/database/schema.sql', 'utf8'));
    await pg.exec(`INSERT INTO subject(id,name) VALUES ('00000000-0000-0000-0000-000000000001','测试科目');
      INSERT INTO exam_question(year,subject_id,question_text) VALUES
      (2024,'00000000-0000-0000-0000-000000000001','测试牙釉质'),
      (2023,'00000000-0000-0000-0000-000000000001','测试牙本质');`);
    // Match the runtime adapter's array-compatible execute result.
    const originalQuery = pg.query.bind(pg);
    pg.query = async (...args) => {
      const result = await originalQuery(...args);
      Object.defineProperty(result.rows, 'rows', {value: result.rows, enumerable: false});
      return result.rows;
    };
    const service = new ExamQuestionsService(drizzle(pg), {});
    const all = await service.findList({});
    assert.equal(all.total, 2);
    assert.equal(all.items.length, 2);
    const filtered = await service.findList({keyword:'牙釉质'});
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0].questionText, '测试牙釉质');
    const page = await service.findList({page:2,pageSize:1});
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].year, 2023);
    const empty = await service.findList({keyword:'不存在'});
    assert.equal(empty.total, 0);
    assert.deepEqual(empty.items, []);
    await pg.exec(`INSERT INTO exam_question(year,subject_id,question_text,source) VALUES
      (2025,'00000000-0000-0000-0000-000000000001','口腔颌面部损伤的特点','甲校'),
      (2024,'00000000-0000-0000-0000-000000000001','简述颌面部损伤有哪些特点','乙校'),
      (2023,'00000000-0000-0000-0000-000000000001','颌面部损伤的处理原则','甲校');`);
    const ranked = await service.getHighFreqQuestions({pageSize:1});
    assert.equal(ranked.total, 4);
    assert.equal(ranked.items[0].frequency, 2);
    assert.equal(ranked.items[0].occurrences.length, 2);
    const school = await service.getHighFreqQuestions({source:'乙校'});
    assert.equal(school.total, 1);
    assert.equal(school.items[0].frequency, 1);
    const year = await service.getHighFreqQuestions({year:2025});
    assert.equal(year.items[0].frequency, 1);
    const second = await service.getHighFreqQuestions({page:2,pageSize:1});
    assert.notEqual(second.items[0].id,ranked.items[0].id);
    const {questionConceptKey:key} = require('../server/dist/common/utils/question-grouping');
    for (const [a,b] of [['上颌骨骨折的临床表现','下颌骨骨折的临床表现'],['感染创口的处理原则','污染创口的处理原则'],['全口义齿固位影响因素','全口义齿固位原理及影响因素']]) assert.notEqual(key(a),key(b));
    console.log('PASS: grouping, frequency, occurrences, school/year filter, group pagination, clinical boundaries');
    console.log('PASS: actual service + production schema: list, keyword, pagination, empty results');
  } finally { await pg.close(); }
})().catch(e => { console.error(e.message, e.cause?.message || ''); process.exitCode=1; });
