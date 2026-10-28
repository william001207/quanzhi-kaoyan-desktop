'use client';

import * as React from 'react';
import ReactMarkdown, { type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkStudyStrong } from '../knowledge-card/study-markdown';

import { cn } from '@/lib/utils';

export interface MarkdownProps extends Options {
  className?: string;
}

const defaultComponents: NonNullable<Options['components']> = {
  a: ({ className, href, ...props }) => (
    <a
      className={cn(className)}
      href={href}
      rel={props.rel ?? 'noreferrer'}
      target={props.target ?? '_blank'}
      {...props}
    />
  ),
  img: ({ className, alt, ...props }) => (
    <img className={cn(className)} alt={alt ?? ''} {...props} />
  ),
  p: ({ children, className, ...props }) => (
    <p className={cn('mb-3 last:mb-0 leading-7', className)} {...props}>
      {children}
    </p>
  ),
  h1: ({ children, className, ...props }) => (
    <h1
      className={cn(
        'text-xl font-semibold mb-4 mt-6 first:mt-0 text-slate-900',
        className,
      )}
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, className, ...props }) => (
    <h2
      className={cn(
        'text-lg font-semibold mb-3 mt-5 first:mt-0 text-slate-800',
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, className, ...props }) => (
    <h3
      className={cn(
        'text-base font-semibold mb-2 mt-4 first:mt-0 text-slate-800',
        className,
      )}
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ children, className, ...props }) => (
    <h4
      className={cn(
        'text-sm font-semibold mb-2 mt-3 first:mt-0 text-slate-700',
        className,
      )}
      {...props}
    >
      {children}
    </h4>
  ),
  ul: ({ children, className, ...props }) => (
    <ul
      className={cn(
        'list-disc pl-5 mb-3 last:mb-0 space-y-1 marker:text-slate-400',
        className,
      )}
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, className, ...props }) => (
    <ol
      className={cn(
        'list-decimal pl-5 mb-3 last:mb-0 space-y-1 marker:text-slate-500 marker:font-medium',
        className,
      )}
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, className, ...props }) => (
    <li className={cn('leading-7', className)} {...props}>
      {children}
    </li>
  ),
  blockquote: ({ children, className, ...props }) => (
    <blockquote
      className={cn(
        'border-l-4 border-slate-300 pl-4 py-1 my-3 text-slate-600 bg-slate-50/60 rounded-r',
        className,
      )}
      {...props}
    >
      {children}
    </blockquote>
  ),
  hr: ({ className, ...props }) => (
    <hr
      className={cn('my-4 border-slate-200', className)}
      {...props}
    />
  ),
  table: ({ children, className, ...props }) => (
    <div className={cn('my-4 overflow-x-auto rounded-md border border-slate-200', className)}>
      <table
        className="w-full text-sm border-collapse"
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children, className, ...props }) => (
    <thead className={cn('bg-slate-100', className)} {...props}>
      {children}
    </thead>
  ),
  th: ({ children, className, ...props }) => (
    <th
      className={cn(
        'px-3 py-2 text-left font-semibold text-slate-700 border border-slate-200 text-xs',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, className, ...props }) => (
    <td
      className={cn(
        'px-3 py-2 border border-slate-200 align-top text-slate-700',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  ),
  strong: ({ children, className, ...props }) => (
    <strong
      className={cn(
        'font-semibold text-slate-900 kp-md-strong',
        className,
      )}
      {...props}
    >
      {children}
    </strong>
  ),
  code: ({ children, className, ...props }) => (
    <code
      className={cn(
        'px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-[13px] font-mono',
        className,
      )}
      {...props}
    >
      {children}
    </code>
  ),
  em: ({ children, className, ...props }) => (
    <em
      className={cn('italic text-slate-700 font-serif', className)}
      {...props}
    >
      {children}
    </em>
  ),
  text: ({ children, className }) => {
    if (typeof children !== 'string') return <>{children}</>;

    const bracketRegex = /[（(]([^）)\n]*[A-Za-z][^）)\n]*)[）)]/g;
    const numberRegex = /\d+(?:[.~～至到—-]\d+)?(?:mm|cm|μm|nm|ml|μl|°|％|%)/g;

    const bracketMatches: Array<{ start: number; end: number; open: string; content: string; close: string }> = [];
    let bm: RegExpExecArray | null;
    while ((bm = bracketRegex.exec(children)) !== null) {
      bracketMatches.push({
        start: bm.index,
        end: bm.index + bm[0].length,
        open: children[bm.index],
        content: bm[1],
        close: children[bm.index + bm[0].length - 1],
      });
    }

    const numberMatches: Array<{ start: number; end: number; text: string }> = [];
    let nm: RegExpExecArray | null;
    while ((nm = numberRegex.exec(children)) !== null) {
      const insideBracket = bracketMatches.some(
        (b) => nm!.index >= b.start && nm!.index + nm![0].length <= b.end,
      );
      if (!insideBracket) {
        numberMatches.push({
          start: nm.index,
          end: nm.index + nm[0].length,
          text: nm[0],
        });
      }
    }

    if (bracketMatches.length === 0 && numberMatches.length === 0) {
      return <span className={cn(className)}>{children}</span>;
    }

    const allMarks: Array<{ start: number; end: number; type: 'bracket' | 'number'; data?: any }> = [
      ...bracketMatches.map((m) => ({ start: m.start, end: m.end, type: 'bracket' as const, data: m })),
      ...numberMatches.map((m) => ({ start: m.start, end: m.end, type: 'number' as const, data: m })),
    ].sort((a, b) => a.start - b.start);

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let key = 0;
    for (const mark of allMarks) {
      if (mark.start < lastIndex) continue;
      if (mark.start > lastIndex) {
        parts.push(children.slice(lastIndex, mark.start));
      }
      if (mark.type === 'bracket') {
        const { open, content, close } = mark.data;
        parts.push(
          <span key={key++} className="text-slate-500">
            {open}
            <span className="italic text-slate-500">{content}</span>
            {close}
          </span>,
        );
      } else {
        parts.push(
          <strong key={key++} className="font-semibold text-slate-900">
            {mark.data.text}
          </strong>,
        );
      }
      lastIndex = mark.end;
    }
    if (lastIndex < children.length) {
      parts.push(children.slice(lastIndex));
    }
    return <span className={cn(className)}>{parts}</span>;
  },
};

export function Markdown({
  className,
  remarkPlugins,
  components,
  ...props
}: MarkdownProps) {
  return (
    <div className={cn('prose-kp max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkStudyStrong, ...(remarkPlugins ?? [])]}
        components={{ ...defaultComponents, ...components }}
        {...props}
      />
    </div>
  );
}
