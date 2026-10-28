import { Markdown } from '@/components/ui/markdown';
import { remarkStudyHighlights } from './study-markdown';

/** Render reference content while keeping answer editors as plain text. */
export default function StudyAnswer({ children }: { children: string }) {
  return <div className="whitespace-normal break-words">
    <Markdown remarkPlugins={[remarkStudyHighlights]} components={{
      strong: ({ children }) => <strong className="font-semibold text-[#a92019]">{children}</strong>,
      mark: ({ children }) => <mark className="rounded-sm bg-[#fff176] px-0.5 text-stone-950">{children}</mark>,
    }}>{children}</Markdown>
  </div>;
}
