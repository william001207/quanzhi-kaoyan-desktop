import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMindTree} from '../src/components/knowledge-card/knowledge-tree.ts';
import {remarkStudyHighlights} from '../src/components/knowledge-card/study-markdown.ts';

test('comparison tables remain connected to their row labels',()=>{
 const tree=buildMindTree('边缘整塑',{blocks:[{title:'方法对照',content:'| 动作 | 整塑部位 |\n| --- | --- |\n| 闭口吸吮 | 上下颌唇颊侧边缘 |\n| 吞咽 | 下颌舌骨后窝 |'}]});
 assert.equal(tree.children[0].children.length,2);
 assert.equal(tree.children[0].children[0].label,'闭口吸吮');
 assert.equal(tree.children[0].children[0].children[0].label,'整塑部位：上下颌唇颊侧边缘');
});
test('multilevel list hierarchy and emphasis survive conversion',()=>{
 const tree=buildMindTree('测试',{blocks:[{title:'分类',content:'1. **主动整塑**\n   1. ==患者自主运动==\n   2. 医生指导\n2. 被动整塑'}]});
 assert.deepEqual(tree.children[0].children.map(n=>n.label),['主动整塑','被动整塑']);
 assert.deepEqual(tree.children[0].children[0].children.map(n=>n.label),['患者自主运动','医生指导']);
});
test('empty cards and escaped table pipes do not generate fake points',()=>{
 assert.equal(buildMindTree('空',undefined).children.length,0);
 const tree=buildMindTree('test',{blocks:[{title:'表',content:'| 项目 | 说明 |\n| --- | --- |\n| A\\|B | C |'}]});
 assert.equal(tree.children[0].children[0].label,'A|B');
});
test('highlights are explicit text nodes; code and raw HTML stay text',()=>{
 const tree={type:'root',children:[{type:'paragraph',children:[{type:'text',value:'保持==托盘稳定==。<script>test</script>'},{type:'inlineCode',value:'==code=='}]}]};
 remarkStudyHighlights()(tree);
 const parts=tree.children[0].children;
 assert.equal(parts[1].data.hName,'mark');assert.equal(parts[1].children[0].value,'托盘稳定');
 assert.equal(parts[2].value,'。<script>test</script>');assert.equal(parts[3].value,'==code==');
});

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { remarkStudyStrong } from '../src/components/knowledge-card/study-markdown.ts';
const parseStudy = (source) => {
 const processor = unified().use(remarkParse).use(remarkStudyStrong).use(remarkStudyHighlights);
 return processor.runSync(processor.parse(source), {value: source});
};
test('Chinese punctuation emphasis renders as strong, with highlights inside', () => {
 const tree=parseStudy('1. **定义。**后接正文，**包括（病因）：**继续。**==重点。==**正文');
 const nodes=tree.children[0].children[0].children[0].children;
 assert.equal(nodes.filter(n=>n.type==='strong').length,3);
 assert.equal(nodes[0].children[0].value,'定义。');
 assert.equal(nodes[4].children[0].data.hName,'mark');
 assert.ok(!nodes.some(n=>n.type==='text' && n.value.includes('**')));
});
test('literal asterisks, escaped syntax, code and unmatched markers stay intact', () => {
 for(const source of ['2 * 3 = 6', String.raw`\*\*定义。\*\*正文`, '**未闭合']) {
  const tree=parseStudy(source);
  assert.ok(!JSON.stringify(tree).includes('"type":"strong"'));
 }
 const tree=parseStudy('`**定义。**正文`\n\n```\n**定义。**正文\n```');
 assert.equal(tree.children[0].children[0].type,'inlineCode');
 assert.equal(tree.children[0].children[0].value,'**定义。**正文');
 assert.equal(tree.children[1].type,'code');
});

test('ordinary emphasis, nested links and table content keep their structure', () => {
 const tree=parseStudy('**正常加粗**，*斜体*，**[链接](https://example.com)**');
 assert.deepEqual(tree.children[0].children.map(n=>n.type),['strong','text','emphasis','text','strong']);
 assert.equal(tree.children[0].children[4].children[0].type,'link');
});

import fs from 'node:fs';
import remarkGfm from 'remark-gfm';
test('current reference answers and cards leave no bold markers visible', () => {
 const processor=unified().use(remarkParse).use(remarkGfm).use(remarkStudyStrong).use(remarkStudyHighlights);
 for(const file of ['exam_question_details','knowledge_point_details']) {
  const records=JSON.parse(fs.readFileSync(new URL(`../../server/data-export/${file}.json`,import.meta.url),'utf8'));
  for(const record of Object.values(records)) {
   for(const source of [record.answer,record.cardData?.summary,...(record.cardData?.blocks||[]).map(b=>b.content)]) {
    if(!source) continue;
    const tree=processor.runSync(processor.parse(source),{value:source});
    const visit=node=>{
     if(node.type==='text') assert.ok(!node.value.includes('**'),`${record.id}: ${node.value}`);
     node.children?.forEach(visit);
    };
    visit(tree);
   }
  }
 }
});
