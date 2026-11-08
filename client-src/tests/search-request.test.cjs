const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
// Execute the actual page effect with controlled network completion order.
function effectFor(apiName){
 const source=fs.readFileSync('src/pages/questions/QuestionsPage.tsx','utf8');
 const tree=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let found;
 function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(tree)==='useEffect'&&n.arguments[0]?.getText(tree).includes(apiName))found=n.arguments[0];ts.forEachChild(n,visit);}
 visit(tree);assert.ok(found);
 const code=ts.transpileModule('const effect = '+found.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return ctx=>new Function(...Object.keys(ctx),code+'; return effect();')(...Object.values(ctx));
}
function setup(){
 const pending=[],events=[];
 const ctx={activeTab:'all',allFilterKey:{current:JSON.stringify(['','','','',''])},filterSubjectId:'',filterYear:'',filterType:'',filterSchool:'',debouncedKeyword:'',allPage:1,allPageSize:20,setAllPage:v=>events.push(['page',v]),setAllLoading:v=>events.push(['loading',v]),setAllLoadingReady:v=>events.push(['ready',v]),setAllQuestions:v=>events.push(['items',v]),setAllTotal:v=>events.push(['total',v]),logger:{error:()=>events.push(['error'])},toast:{error:()=>events.push(['toast'])},api:{examQuestions:{list:args=>new Promise((resolve,reject)=>pending.push({args,resolve,reject}))}}};
 return {ctx,pending,events};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('late old response cannot replace a newer result or its loading state',async()=>{
 const run=effectFor('api.examQuestions.list('),{ctx,pending,events}=setup();const cleanup=run(ctx);cleanup();run({...ctx,debouncedKeyword:'龋'});
 pending[1].resolve({items:['new'],total:1});await flush();const snapshot=JSON.stringify(events);pending[0].resolve({items:['old'],total:99});await flush();assert.equal(JSON.stringify(events),snapshot);assert.deepEqual(events.find(e=>e[0]==='items'),['items',['new']]);
});
test('changing filter on page three only requests the reset page',()=>{
 const run=effectFor('api.examQuestions.list('),{ctx,pending,events}=setup();run({...ctx,allPage:3,debouncedKeyword:'牙'});assert.equal(pending.length,0);assert.deepEqual(events,[['page',1]]);run({...ctx,allPage:1,debouncedKeyword:'牙'});assert.equal(pending.length,1);assert.equal(pending[0].args.page,1);
});
test('cancelled query errors do not show stale toasts',async()=>{
 const run=effectFor('api.examQuestions.list('),{ctx,pending,events}=setup();run(ctx)();pending[0].reject(new Error('old'));await flush();assert.deepEqual(events,[['loading',true]]);
});
