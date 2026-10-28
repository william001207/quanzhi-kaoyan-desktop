import type {} from 'remark-parse';

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

/** Accept paired **bold** next to Chinese punctuation. Parse at the token level
 * so neighbouring bold spans cannot pair with each other's closing markers.
 * Code, escapes, unmatched markers and complex emphasis retain Markdown rules.
 */
export function remarkStudyStrong(this: import('unified').Processor) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push({ text: { 42: { name: 'studyStrong', tokenize } } });
  (data.fromMarkdownExtensions ??= []).push({
    enter: { studyStrong(token) { this.enter({ type: 'strong', children: [] }, token); } },
    exit: { studyStrong(token) { this.exit(token); } },
  });
}

declare module 'micromark-util-types' {
  interface TokenTypeMap { studyStrong: 'studyStrong'; studyStrongMarker: 'studyStrongMarker' }
}

const tokenize: import('micromark-util-types').Tokenizer = function (effects, ok, nok) {
  let previous: number | null = null;
  const initialPrevious = this.previous;
  const space = (code: number | null) => code === null || code < 0 || code === 32;
  const start: import('micromark-util-types').State = (code) => {
    if (initialPrevious === 42) return nok(code);
    effects.enter('studyStrong');
    effects.enter('studyStrongMarker');
    effects.consume(code!);
    return second;
  };
  const second: import('micromark-util-types').State = (code) => {
    if (code !== 42) return nok(code);
    effects.consume(code);
    effects.exit('studyStrongMarker');
    return contentStart;
  };
  const contentStart: import('micromark-util-types').State = (code) => {
    if (space(code) || code === 42) return nok(code);
    effects.enter('chunkText', { contentType: 'text' });
    return content(code);
  };
  const content: import('micromark-util-types').State = (code) => {
    if (code === null || code < 0 || code === 92 || code === 96) return nok(code);
    if (code === 42) {
      if (space(previous)) return nok(code);
      effects.exit('chunkText');
      effects.enter('studyStrongMarker');
      effects.consume(code);
      return close;
    }
    previous = code;
    effects.consume(code);
    return content;
  };
  const close: import('micromark-util-types').State = (code) => {
    if (code !== 42) return nok(code);
    effects.consume(code);
    return after;
  };
  const after: import('micromark-util-types').State = (code) => {
    if (code === 42) return nok(code);
    effects.exit('studyStrongMarker');
    effects.exit('studyStrong');
    return ok(code);
  };
  return start;
};
