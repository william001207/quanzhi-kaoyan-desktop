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
