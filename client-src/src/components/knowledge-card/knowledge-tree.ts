export interface MindNode {
  id: string;
  label: string;
  kind: 'root' | 'branch' | 'leaf';
  badge?: string;
  children: MindNode[];
}

interface CardData {
  blocks?: Array<{ title: string; content: string }>;
  flowSteps?: string[];
  summary?: string;
}

export function stripStudyMarkdown(text: string): string {
  return text.replace(/\*\*|==|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*#{1,6}\s*/, '').trim();
}

function cells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/)
    .map(s => stripStudyMarkdown(s.replace(/\\\|/g, '|')));
}

/** Keep every table cell and list level; diagrams derive from the card itself. */
export function buildMindTree(title: string, data: CardData | undefined): MindNode {
  let serial = 0;
  const node = (label: string, children: MindNode[] = []): MindNode => ({
    id: `study-${serial++}`, label: stripStudyMarkdown(label),
    kind: children.length ? 'branch' : 'leaf', children,
  });
  const children: MindNode[] = [];
  for (const block of data?.blocks ?? []) {
    const branch = node(block.title);
    const lines = block.content.replace(/\r\n/g, '\n').split('\n');
    const stack: Array<{ indent: number; item: MindNode }> = [];
    const add = (item: MindNode, indent: number) => {
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack.length ? stack[stack.length - 1].item : branch;
      parent.children.push(item);
      parent.kind = 'branch';
      stack.push({ indent, item });
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?[\s:|\-]+\|?\s*$/.test(lines[i + 1])) {
        const headers = cells(line);
        stack.length = 0;
        i += 2;
        for (; i < lines.length && lines[i].trim().startsWith('|'); i++) {
          const row = cells(lines[i]);
          const points = row.slice(1).map((v, j) => node(`${headers[j + 1] || '说明'}：${v}`));
          branch.children.push(node(row[0] || '要点', points));
        }
        i--;
        continue;
      }
      const item = /^(\s*)(?:\*\*)?(?:\d+[.、)．]|[（(]\d+[）)]|[一二三四五六七八九十]+、|[①-⑳]|[-*•])(?:\*\*)?\s*(.*)$/.exec(line);
      const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
      if (item) {
        add(node(item[2]), item[1].replace(/\t/g, '    ').length);
      } else if (heading) {
        add(node(heading[2]), heading[1].length - 7);
      } else {
        const label = stripStudyMarkdown(line);
        if (!label) continue;
        if (stack.length && /^\s{2,}\S/.test(line)) {
          stack[stack.length - 1].item.label += ` ${label}`;
        } else {
          stack.length = 0;
          branch.children.push(node(label));
        }
      }
    }
    if (branch.children.length) { branch.kind = 'branch'; children.push(branch); }
  }
  if (data?.flowSteps?.length) children.push({ ...node('梳理顺序', data.flowSteps.map(s => node(s))), badge: '顺序' });
  if (data?.summary) children.push({ ...node(data.summary), badge: '总结' });
  return { id: 'root', label: stripStudyMarkdown(title), kind: 'root', children };
}
