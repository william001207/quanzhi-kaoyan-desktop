/** Only explicit ==highlights== become marks; raw HTML stays disabled. */
interface StudyNode {
  type: string;
  value?: string;
  children?: StudyNode[];
  data?: { hName: string };
}

export function remarkStudyHighlights() {
  return (tree: StudyNode) => {
    const visit = (parent: StudyNode) => {
      if (!parent.children || parent.type === 'code' || parent.type === 'inlineCode') return;
      parent.children = parent.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          visit(child);
          return [child];
        }
        const parts: StudyNode[] = [];
        const pattern = /==([^=\n]+)==/g;
        let end = 0;
        for (const match of child.value.matchAll(pattern)) {
          const start = match.index!;
          if (start > end) parts.push({ type: 'text', value: child.value.slice(end, start) });
          parts.push({ type: 'emphasis', data: { hName: 'mark' }, children: [{ type: 'text', value: match[1] }] });
          end = start + match[0].length;
        }
        if (end === 0) return [child];
        if (end < child.value.length) parts.push({ type: 'text', value: child.value.slice(end) });
        return parts;
      });
    };
    visit(tree);
  };
}
