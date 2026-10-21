import { Markdown } from '@/components/ui/markdown';
import type { KnowledgePointCardData } from '@shared/api.interface';
import { ArrowRight, BookOpen } from 'lucide-react';

interface KnowledgeCardViewProps {
  data: KnowledgePointCardData;
  title: string;
  subjectName?: string;
}

const KnowledgeCardView: React.FC<KnowledgeCardViewProps> = ({
  data,
  title,
  subjectName,
}) => {
  const hasFlow = data.flowSteps && data.flowSteps.length > 0;
  const hasBlocks = data.blocks && data.blocks.length > 0;
  const hasSummary = !!data.summary;

  return (
    <div className="knowledge-card max-w-4xl mx-auto">
      {/* 大标题 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-amber-800 mb-2">
          <BookOpen className="h-3.5 w-3.5" />
          <span className="font-medium tracking-wide">
            {subjectName || '医学知识'}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-stone-800 leading-snug">
          {title}
        </h1>
      </div>

      {/* 顶部流程条 */}
      {hasFlow && (
        <div className="mb-6 overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max pb-1">
            {data.flowSteps!.map((step, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-sm text-stone-700 font-medium whitespace-nowrap">
                  <span className="text-amber-700 mr-1.5 font-bold">
                    {i + 1}.
                  </span>
                  {step}
                </div>
                {i < data.flowSteps!.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-amber-500 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 分块内容 */}
      {hasBlocks && (
        <div className="space-y-5">
          {data.blocks!.map((block, i) => (
            <div
              key={i}
              className="border border-stone-200 rounded-lg overflow-hidden bg-white shadow-sm"
            >
              {/* 棕色标题条 */}
              <div className="bg-stone-700 px-4 py-2.5 flex items-center gap-3">
                <span className="text-amber-100 font-bold text-base w-6 flex-shrink-0">
                  {i + 1}
                </span>
                <div className="flex items-baseline gap-2 flex-1 min-w-0">
                  <h3 className="text-white font-semibold text-base truncate">
                    {block.title}
                  </h3>
                  {block.subtitleEn && (
                    <span className="text-amber-200/80 italic text-sm truncate flex-shrink-0">
                      {block.subtitleEn}
                    </span>
                  )}
                </div>
              </div>
              {/* 内容区 */}
              <div className="p-4 card-block-content text-sm text-stone-700 leading-relaxed">
                <Markdown
                  components={{
                    thead: ({ children, className, ...props }) => (
                      <thead
                        className="bg-amber-50"
                        {...props}
                      >
                        {children}
                      </thead>
                    ),
                    th: ({ children, className, ...props }) => (
                      <th
                        className="px-3 py-2 text-left font-semibold text-stone-700 border border-stone-200 text-xs bg-amber-50"
                        {...props}
                      >
                        {children}
                      </th>
                    ),
                    strong: ({ children, className, ...props }) => (
                      <strong
                        className="font-semibold text-stone-900"
                        {...props}
                      >
                        {children}
                      </strong>
                    ),
                    table: ({ children, className, ...props }) => (
                      <div
                        className="my-3 overflow-x-auto rounded-md border border-stone-200"
                        {...props}
                      >
                        <table className="w-full text-sm border-collapse">
                          {children}
                        </table>
                      </div>
                    ),
                  }}
                >
                  {block.content}
                </Markdown>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 底部总结框 */}
      {hasSummary && (
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="text-xs font-semibold text-amber-800 mb-1.5 flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-amber-600" />
            记忆口诀 / 核心总结
          </div>
          <p className="text-sm text-stone-700 leading-relaxed font-medium">
            {data.summary}
          </p>
        </div>
      )}
    </div>
  );
};

export default KnowledgeCardView;
