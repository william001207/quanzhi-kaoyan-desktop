import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ChevronRight,
  Crosshair,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
} from 'lucide-react';
import type { KnowledgePointCardData } from '@shared/api.interface';

import { buildMindTree, type MindNode } from './knowledge-tree';
export { buildMindTree, type MindNode } from './knowledge-tree';

/* ------------------------------------------------------------------ */
/* 布局                                                                */
/* ------------------------------------------------------------------ */

const FONT_SIZE = 13;
const CHAR_W = 13; // 一个中文字符的宽度
const PAD_X = 13;
const PAD_Y = 8;
const LINE_H = 19;
const MIN_W = 108;
const MAX_W = 244;
const ROOT_MAX_W = 300;
const COL_GAP = 52;
const ROW_GAP = 10;

/** 以「中文字符」为单位估算文本宽度 */
function textUnits(text: string): number {
  let units = 0;
  for (const ch of text) {
    // eslint-disable-next-line no-control-regex
    units += /[\x00-\xff]/.test(ch) ? 0.56 : 1;
  }
  return units;
}

interface Measured {
  node: MindNode;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  children: Measured[];
  /** 子树占用的纵向高度 */
  subtreeH: number;
  hasChildren: boolean;
  collapsed: boolean;
}

function measureNode(node: MindNode, depth: number): { w: number; h: number } {
  const maxW = node.kind === 'root' ? ROOT_MAX_W : MAX_W;
  const units = textUnits(node.label);
  const need = units * CHAR_W + PAD_X * 2 + (node.children.length ? 16 : 0);
  const w = Math.min(maxW, Math.max(MIN_W, need));
  const perLine = Math.max(1, Math.floor((w - PAD_X * 2) / CHAR_W));
  const lines = Math.max(1, Math.ceil(units / perLine));
  return { w, h: lines * LINE_H + PAD_Y * 2 };
}

function layout(node: MindNode, depth: number, collapsed: Set<string>): Measured {
  const { w, h } = measureNode(node, depth);
  const isCollapsed = collapsed.has(node.id);
  const kids = isCollapsed
    ? []
    : node.children.map((child) => layout(child, depth + 1, collapsed));
  const kidsH =
    kids.reduce((sum, kid) => sum + kid.subtreeH, 0) +
    ROW_GAP * Math.max(0, kids.length - 1);

  return {
    node,
    x: 0,
    y: 0,
    w,
    h,
    depth,
    children: kids,
    subtreeH: Math.max(h, kidsH),
    hasChildren: node.children.length > 0,
    collapsed: isCollapsed,
  };
}

interface Edge {
  id: string;
  d: string;
}

function assignPositions(
  root: Measured,
): { nodes: Measured[]; edges: Edge[]; width: number; height: number } {
  // 每层最大宽度 → 每层起始 x
  const colMax: number[] = [];
  const walk = (m: Measured) => {
    colMax[m.depth] = Math.max(colMax[m.depth] || 0, m.w);
    m.children.forEach(walk);
  };
  walk(root);

  const colX: number[] = [];
  let acc = 0;
  colMax.forEach((w, i) => {
    colX[i] = acc;
    acc += (w || 0) + COL_GAP;
  });

  const place = (m: Measured, top: number) => {
    m.x = colX[m.depth] || 0;
    m.y = top + (m.subtreeH - m.h) / 2;
    if (!m.children.length) return;
    const kidsH =
      m.children.reduce((s, k) => s + k.subtreeH, 0) +
      ROW_GAP * (m.children.length - 1);
    let cursor = top + (m.subtreeH - kidsH) / 2;
    for (const kid of m.children) {
      place(kid, cursor);
      cursor += kid.subtreeH + ROW_GAP;
    }
  };
  place(root, 0);

  const nodes: Measured[] = [];
  const edges: Edge[] = [];
  const collect = (m: Measured) => {
    nodes.push(m);
    m.children.forEach((kid) => {
      const x1 = m.x + m.w;
      const y1 = m.y + m.h / 2;
      const x2 = kid.x;
      const y2 = kid.y + kid.h / 2;
      const mid = (x2 - x1) / 2;
      edges.push({
        id: `${m.node.id}->${kid.node.id}`,
        d: `M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`,
      });
      collect(kid);
    });
  };
  collect(root);

  const maxRight = nodes.reduce((s, n) => Math.max(s, n.x + n.w), 0);
  const maxBottom = root.subtreeH;

  return { nodes, edges, width: maxRight, height: maxBottom };
}

/* ------------------------------------------------------------------ */
/* 组件                                                                */
/* ------------------------------------------------------------------ */

interface KnowledgeMindMapProps {
  title: string;
  data?: KnowledgePointCardData;
}

const KIND_STYLE: Record<MindNode['kind'], string> = {
  root: 'bg-slate-800 text-white border-slate-800 shadow-md',
  branch: 'bg-indigo-50/80 text-slate-800 border-indigo-200 shadow-sm',
  leaf: 'bg-white text-slate-700 border-slate-200 shadow-sm',
};

const KnowledgeMindMap: React.FC<KnowledgeMindMapProps> = ({
  title,
  data,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [fullscreen, setFullscreen] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  const scale = view.k;

  const tree = useMemo(() => buildMindTree(title, data), [title, data]);
  const measured = useMemo(() => layout(tree, 0, collapsed), [tree, collapsed]);
  const { nodes, edges, width, height } = useMemo(
    () => assignPositions(measured),
    [measured],
  );

  const isEmpty = tree.children.length === 0;

  // 全屏时锁定页面滚动，Esc 退出
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  /* 容器尺寸（用于「适应窗口」） */
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setBox({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullscreen]);

  const fit = useCallback(() => {
    if (!box.w || !box.h || !width || !height) return;
    const pad = 32;
    const k = Math.min(
      (box.w - pad * 2) / width,
      (box.h - pad * 2) / height,
      1.2,
    );
    const nextScale = Math.max(0.05, k);
    setView({
      x: (box.w - width * nextScale) / 2,
      y: (box.h - height * nextScale) / 2,
      k: nextScale,
    });
  }, [box.w, box.h, width, height]);

  // 换知识点时清掉上一份的折叠状态
  useEffect(() => {
    setCollapsed(new Set());
  }, [title]);

  // 首次进入 / 换知识点 / 全屏切换时自动适应
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.w, box.h, fullscreen, title]);

  /** 按钮缩放：围绕画布中心 */
  const zoomBy = (factor: number) => {
    setView((prev) => {
      const k = Math.min(2, Math.max(0.05, prev.k * factor));
      const cx = box.w / 2;
      const cy = box.h / 2;
      return {
        x: cx - ((cx - prev.x) / prev.k) * k,
        y: cy - ((cy - prev.y) / prev.k) * k,
        k,
      };
    });
  };

  // 滚轮缩放：用原生监听，才能 preventDefault（React 的 onWheel 是 passive）
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setView((prev) => {
        const k = Math.min(2, Math.max(0.05, prev.k * factor));
        return {
          x: cx - ((cx - prev.x) / prev.k) * k,
          y: cy - ((cy - prev.y) / prev.k) * k,
          k,
        };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [fullscreen]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-node-hit]')) return;
    dragRef.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setView((prev) => ({
      ...prev,
      x: drag.ox + (e.clientX - drag.x),
      y: drag.oy + (e.clientY - drag.y),
    }));
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => {
    const ids: string[] = [];
    const walk = (n: MindNode) => {
      if (n.children.length) {
        ids.push(n.id);
        n.children.forEach(walk);
      }
    };
    tree.children.forEach(walk);
    setCollapsed(new Set(ids));
  };

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-50 bg-slate-50 flex flex-col'
          : 'rounded-lg border border-slate-200 bg-slate-50/60 overflow-hidden'
      }
    >
      {/* 工具条 */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">思维导图</span>
          <span className="hidden sm:inline text-slate-400">
            点击节点折叠 · 拖拽平移 · 滚轮缩放
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.15)}
            className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            title="缩小"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="text-[11px] text-slate-500 w-11 text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomBy(1.15)}
            className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            title="放大"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={fit}
            className="h-7 px-2 inline-flex items-center gap-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[11px]"
            title="适应窗口"
          >
            <Crosshair className="h-3.5 w-3.5" />
            适应
          </button>
          {!isEmpty && (
            <>
              <button
                type="button"
                onClick={expandAll}
                className="h-7 px-2 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[11px]"
              >
                全展开
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="h-7 px-2 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[11px]"
              >
                全收起
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            title={fullscreen ? '退出全屏' : '全屏'}
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 画布 */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={fit}
        className={`relative overflow-hidden select-none cursor-grab active:cursor-grabbing ${
          fullscreen ? 'flex-1' : 'h-[440px] md:h-[520px]'
        }`}
        style={{
          backgroundImage:
            'radial-gradient(circle, #dbe2ea 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        {isEmpty ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md text-center">
              <div className="text-sm font-medium text-slate-700 mb-1">
                本知识点还没有内容数据
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                导图由知识点的卡片要点或正文生成。
                <br />
                当前这条知识点只有标题与章节归属，补充要点后会自动出现分支。
              </p>
            </div>
          </div>
        ) : null}

        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          }}
        >
          <svg
            width={width + 8}
            height={height + 8}
            className="absolute left-0 top-0 pointer-events-none overflow-visible"
          >
            {edges.map((edge) => (
              <path
                key={edge.id}
                d={edge.d}
                fill="none"
                stroke="#c7d2e0"
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            ))}
          </svg>

          {nodes.map((item) => {
            const isRoot = item.node.kind === 'root';
            return (
              <div
                key={item.node.id}
                data-node-hit
                onClick={() => item.hasChildren && toggle(item.node.id)}
                className={`absolute flex items-center gap-1.5 rounded-lg border px-3 py-2 transition-shadow ${KIND_STYLE[item.node.kind]} ${
                  item.hasChildren ? 'cursor-pointer hover:shadow-md' : ''
                } ${isRoot ? 'font-semibold' : ''}`}
                style={{
                  left: item.x,
                  top: item.y,
                  width: item.w,
                  minHeight: item.h,
                }}
                title={item.node.label}
              >
                <span
                  className="flex-1 whitespace-pre-wrap break-words"
                  style={{ fontSize: FONT_SIZE, lineHeight: `${LINE_H}px` }}
                >
                  {item.node.label}
                </span>
                {item.node.badge && !item.hasChildren ? (
                  <span className="text-[10px] px-1 rounded bg-white/70 text-indigo-700 border border-indigo-200 shrink-0">
                    {item.node.badge}
                  </span>
                ) : null}
                {item.hasChildren ? (
                  <ChevronRight
                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                      item.collapsed ? '' : 'rotate-90'
                    } ${isRoot ? 'text-white/70' : 'text-slate-400'}`}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeMindMap;
