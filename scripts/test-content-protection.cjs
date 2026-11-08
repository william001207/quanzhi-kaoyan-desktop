const {PGlite}=require('../server/node_modules/@electric-sql/pglite');
const {seedContentBaseline,protectContentSync}=require('../server/dist/database/content-protection');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const db=new PGlite();try {
 await db.exec(fs.readFileSync('server/database/schema.sql','utf8'));
 await db.exec(`CREATE TABLE IF NOT EXISTS app_meta(key text PRIMARY KEY,value text);
 INSERT INTO subject(id,name) VALUES('00000000-0000-0000-0000-000000000001','test');
 INSERT INTO exam_question(id,subject_id,year,question_text,answer,answer_count) VALUES('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',2026,'old text','old answer',7);
 INSERT INTO chapter(id,subject_id,title) VALUES('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','test');
 INSERT INTO knowledge_point(id,subject_id,chapter_id,title,card_data) VALUES('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','card','{"summary":"old"}');`);
 const snapshot=async()=>{const b={};for(const t of ['exam_question','knowledge_point']) b[t]=Object.fromEntries((await db.query(`SELECT * FROM ${t}`)).rows.map(r=>[r.id,r]));return b;};
 const original=await snapshot();await seedContentBaseline(db,original);
 await db.exec(`UPDATE exam_question SET answer='personal',answer_keywords=ARRAY['mine']; UPDATE knowledge_point SET card_data='{"summary":"personal"}';`);
 const next=structuredClone(original);const q=Object.values(next.exam_question)[0];q.answer='official next';q.question_text='new text';Object.values(next.knowledge_point)[0].card_data={summary:'new'};
 const sync=()=>db.exec(`UPDATE exam_question SET answer='official next',question_text='new text',answer_keywords=ARRAY['official']; UPDATE knowledge_point SET card_data='{"summary":"new"}';`);
 await db.transaction(tx=>protectContentSync(tx,next,()=>tx.exec(`UPDATE exam_question SET answer='official next',question_text='new text',answer_keywords=ARRAY['official']; UPDATE knowledge_point SET card_data='{"summary":"new"}';`)));
 let actual=await snapshot();assert.equal(Object.values(actual.exam_question)[0].answer,'personal');assert.equal(Object.values(actual.exam_question)[0].question_text,'new text');assert.equal(Object.values(actual.exam_question)[0].answer_count,7);assert.deepEqual(Object.values(actual.exam_question)[0].answer_keywords,['mine']);assert.equal(Object.values(actual.knowledge_point)[0].card_data.summary,'personal');
 await db.transaction(tx=>protectContentSync(tx,next,()=>tx.exec(`UPDATE exam_question SET answer='official next'`)));
 assert.equal(Object.values((await snapshot()).exam_question)[0].answer,'personal');
 await assert.rejects(db.transaction(tx=>protectContentSync(tx,next,async()=>{await tx.exec("UPDATE exam_question SET answer='bad'");throw Error('interrupted');})));
 assert.equal(Object.values((await snapshot()).exam_question)[0].answer,'personal');
 await db.exec("DELETE FROM app_meta");
 await db.transaction(tx=>protectContentSync(tx,next,()=>tx.exec("UPDATE exam_question SET answer='overwrite',question_text='overwrite'")));
 actual=await snapshot();assert.equal(Object.values(actual.exam_question)[0].answer,'personal');assert.equal(Object.values(actual.exam_question)[0].question_text,'new text');
 console.log('PASS: edited answer/keywords/cards preserved, unedited field updated, repeat upgrades, progress, rollback, unknown legacy baseline');
 }finally{await db.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
