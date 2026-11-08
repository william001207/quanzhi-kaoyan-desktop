/** Conservative wording normalization: never remove the tested clinical qualifier. */
function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase()
    .replace(/^(请)?(简述|试述|论述|简答|叙述|描述|简要说明|简要叙述|说明)/, '')
    .replace(/有哪些|是什么|何谓|什么是/g, '')
    .replace(/口腔颌面部/g, '颌面部')
    .replace(/的/g, '')
    .replace(/[\p{P}\p{Z}\s]/gu, '');
}
export function groupQuestions<T extends { id: string; subject_id: string; question_text: string; year: number }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.subject_id}:${questionConceptKey(row.question_text) || row.id}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => group.sort((a,b) => b.year-a.year || b.id.localeCompare(a.id)))
    .sort((a,b) => b.length-a.length || b[0].year-a[0].year || b[0].id.localeCompare(a[0].id));
}

// Reviewed equivalent phrasings only. Similarity scores alone must never merge questions.
const equivalentPhrases = [
 ['局限性侵袭性牙周炎临床表现', '局限型侵袭性牙周炎临床表现'],
 ['正畸中保持原因', '正畸保持原因'],
 ['三叉神经痛卡马西平药物治疗用量及不良反应', '三叉神经痛卡马西平药物治疗用量和不良反应'],
 ['全口固位不良原因及处理', '全口义齿固位不良原因及处理'],
 ['根分叉病变治疗目标', '根分叉病变治疗目的'],
 ['智齿冠周炎感染扩散途径', '智齿冠周炎扩散途径'],
 ['全口义齿稳定因素', '影响全口义齿稳定因素', '全口义齿稳定影响因素'],
 ['成年人正畸治疗特点', '成人正畸治疗特点'],
 ['垂直距离确定方法', '垂直距离测定方法'],
 ['全口义齿固位影响因素', '全口义齿固位因素'],
 ['下颌骨折临床表现', '下颌骨骨折临床表现'],
 ['翻瓣术愈合方式', '翻瓣术后愈合方式'],
 ['牙釉质粘接机制', '牙釉质粘结机制'],
 ['良恶性肿瘤鉴别', '良恶性肿瘤鉴别诊断'],
];
const aliases = new Map(equivalentPhrases.flatMap(group => group.map(text => [normalize(text), normalize(group[0])] as const)));
export function questionConceptKey(text: string): string {
 const key = normalize(text);
 return aliases.get(key) ?? key;
}
