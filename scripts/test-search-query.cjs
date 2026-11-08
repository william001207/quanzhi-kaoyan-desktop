const {PGlite}=require('../server/node_modules/@electric-sql/pglite');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 try {
 await db.exec(`CREATE TABLE exam_question(id int PRIMARY KEY);CREATE TABLE knowledge_point(id int PRIMARY KEY,exam_frequency int);CREATE TABLE question_knowledge_point(question_id int,knowledge_point_id int);CREATE TABLE wrong_question(question_id int,wrong_count int);CREATE TABLE review_record(question_id int,reviewed_at timestamp,review_type text);
 INSERT INTO exam_question SELECT generate_series(1,2000);INSERT INTO knowledge_point VALUES(1,5),(2,9);
 INSERT INTO question_knowledge_point SELECT id,1 FROM exam_question WHERE id%2=0;INSERT INTO question_knowledge_point SELECT id,2 FROM exam_question WHERE id%3=0;
 INSERT INTO wrong_question SELECT id,2 FROM exam_question WHERE id%2=0;INSERT INTO wrong_question SELECT id,3 FROM exam_question WHERE id%3=0;
 INSERT INTO review_record SELECT id,'2026-11-01','question' FROM exam_question WHERE id%2=0;INSERT INTO review_record SELECT id,'2026-11-08','knowledge_point' FROM exam_question;
 CREATE INDEX ON question_knowledge_point(question_id);CREATE INDEX ON wrong_question(question_id);CREATE INDEX ON review_record(question_id);`);
 const source=fs.readFileSync('server/modules/exam-questions/exam-questions.service.ts','utf8');
 const scalars=[...source.matchAll(/(?:frequency|wrongCount|reviewedAt): sql<[^>]+>`([^`]+)`/g)].slice(0,3).map(m=>m[1].replaceAll('${examQuestion.id}','eq.id').replaceAll('"exam_question"."id"','eq.id'));
 assert.equal(scalars.length,3);
 const combined=`SELECT eq.id,${scalars[0]} AS frequency,${scalars[1]} AS wrong_count,${scalars[2]} AS reviewed_at FROM exam_question eq WHERE eq.id<=20 ORDER BY eq.id`;
 const prior=[`SELECT q.question_id,MAX(k.exam_frequency) v FROM question_knowledge_point q JOIN knowledge_point k ON q.knowledge_point_id=k.id WHERE q.question_id<=20 GROUP BY q.question_id`,`SELECT question_id,SUM(wrong_count) v FROM wrong_question WHERE question_id<=20 GROUP BY question_id`,`SELECT question_id,MAX(reviewed_at) v FROM review_record WHERE question_id<=20 AND review_type='question' GROUP BY question_id`];
 const maps=[];for(const sql of prior)maps.push(new Map((await db.query(sql)).rows.map(r=>[r.question_id,r.v])));
 for(const row of (await db.query(combined)).rows){assert.equal(row.frequency,maps[0].get(row.id)??null);assert.equal(row.wrong_count,maps[1].get(row.id)??null);assert.equal(String(row.reviewed_at),String(maps[2].get(row.id)??null));}
 const old=[],next=[];for(let i=0;i<25;i++){let t=performance.now();for(const sql of prior)await db.query(sql);old.push(performance.now()-t);t=performance.now();await db.query(combined);next.push(performance.now()-t);}
 const median=x=>x.sort((a,b)=>a-b)[Math.floor(x.length/2)];console.log(JSON.stringify({matched:true,fixtureQuestions:2000,metadataQueriesBefore:3,metadataQueriesAfter:1,medianMsBefore:median(old),medianMsAfter:median(next),scope:'synthetic in-memory database only'}));
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
