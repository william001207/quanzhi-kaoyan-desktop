import { Markdown } from '@/components/ui/markdown';
import type { KnowledgePointCardData } from '@shared/api.interface';
import { ArrowRight } from 'lucide-react';
import { remarkStudyHighlights } from './study-markdown';

interface KnowledgeCardViewProps {
  data: KnowledgePointCardData;
  title: string;
  subjectName?: string;
}

const chinese = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export default function KnowledgeCardView({ data, title, subjectName }: KnowledgeCardViewProps) {
  return (
    <article className="knowledge-card mx-auto max-w-4xl rounded-lg bg-[#fffdf8] px-4 py-6 text-stone-950 sm:px-7 sm:py-8" style={{ fontFamily: '"Songti SC", "Noto Serif CJK SC", "SimSun", serif' }}>
      <header className="mb-6 border-b border-stone-400 pb-4 text-center">
        {subjectName && <p className="mb-2 text-xs font-sans tracking-wider text-stone-600">{subjectName}</p>}
        <h1 className="break-words text-2xl font-bold leading-snug sm:text-4xl">{title}</h1>
      </header>

      <div className="space-y-6">
        {data.blocks?.map((block, i) => (
          <section key={i}>
            <h2 className="mb-3 rounded-sm bg-[#f1ede3] px-3 py-2 text-lg font-bold leading-relaxed sm:text-xl">
              {chinese[i] || i + 1}、{block.title}
              {block.subtitleEn && <span className="ml-2 break-words text-base font-normal italic text-stone-700">{block.subtitleEn}</span>}
            </h2>
            <div className="card-block-content px-1 text-base leading-8">
              <Markdown remarkPlugins={[remarkStudyHighlights]} components={{
                strong: ({ children }) => <strong className="font-bold text-[#a92019]">{children}</strong>,
                mark: ({ children }) => <mark className="rounded-sm bg-[#fff176] px-0.5 py-0.5 font-semibold text-stone-950">{children}</mark>,
                table: ({ children }) => <div className="my-3 overflow-x-auto rounded border border-stone-500"><table className="w-full border-collapse text-sm sm:text-base">{children}</table></div>,
                thead: ({ children }) => <thead className="bg-[#f1ede3]">{children}</thead>,
                th: ({ children }) => <th className="border border-stone-400 px-3 py-2 text-left font-bold">{children}</th>,
                td: ({ children }) => <td className="border border-stone-400 px-3 py-2 align-top leading-7 text-stone-950">{children}</td>,
              }}>{block.content}</Markdown>
            </div>
          </section>
        ))}
      </div>

      {!!data.flowSteps?.length && <section className="mt-6">
        <h2 className="mb-3 bg-[#f1ede3] px-3 py-2 text-lg font-bold">梳理顺序</h2>
        <ol className="flex flex-wrap items-center gap-2">
          {data.flowSteps.map((step, i) => <li key={i} className="flex items-center gap-2 text-sm leading-7">
            {i > 0 && <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-stone-500" />}
            <span className="rounded-sm bg-[#fff176] px-2 py-0.5">{step}</span>
          </li>)}
        </ol>
      </section>}
      {data.summary && <footer className="mt-6 border-t border-stone-300 pt-4">
        <h2 className="mb-2 text-base font-bold">核心总结</h2>
        <Markdown remarkPlugins={[remarkStudyHighlights]}>{data.summary}</Markdown>
      </footer>}
    </article>
  );
}
