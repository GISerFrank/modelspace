// src/app/page.tsx - 重构后的版本
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  pointerWithin,
  PointerSensor,
  MouseSensor,
  TouchSensor,
  useSensors,
  useSensor,
} from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SmartImportDialog } from "@/components/SmartImportDialog";
import {
  Download,
  Upload,
  Link2,
  Info,
  Search,
  Layers,
  ExternalLink,
  FileText,
  X,
  ArrowLeft,
  ArrowRight,
  MessageSquare,
  Send,
  Sparkles,
  StickyNote,
  Copy,
  Plus,
  Minus,
  Maximize2,
  RotateCcw,
  Wand2,
  Box,
  BookOpen,
} from "lucide-react";
import { MODULE_KNOWLEDGE } from "@/lib/module-knowledge";
import {ModelLibrary} from "@/components/ModelLibrary";

/**
 * AI Model Puzzle Builder - 重构版
 *
 * 主要改进：
 * 1. 三标签布局：模块 / 模型 / 工具
 * 2. 模块标签：实例参数 + 类型知识（原理/训练/效果）
 * 3. 模型标签：元信息 + 统计 + 验证 + 全局训练配置
 */

// ===== 常量定义 =====
const GRID = 80;
const NODE_W = 200;
const NODE_H = 110;
const HDR_H = 32;

const MODULE_TYPES = [
  { type: "Tokenizer", color: "bg-emerald-100", kind: "io", d: { vocab: 32000, model: "BPE" } },
  { type: "Embedding", color: "bg-emerald-100", kind: "core", d: { dim: 768 } },
  { type: "Positional Encoding", color: "bg-emerald-100", kind: "core", d: { max_len: 5000 } },
  { type: "Multi-Head Attention", color: "bg-blue-100", kind: "core", d: { heads: 8, dim: 512 } },
  { type: "Feed-Forward", color: "bg-purple-100", kind: "core", d: { d_ff: 2048, dropout: 0.1 } },
  { type: "LayerNorm", color: "bg-amber-100", kind: "norm", d: { eps: 1e-5 } },
  { type: "Dropout", color: "bg-amber-100", kind: "reg", d: { p: 0.1 } },
  { type: "Residual", color: "bg-slate-100", kind: "conn", d: {} },
  { type: "Pooling", color: "bg-cyan-100", kind: "pool", d: { mode: "mean" } },
  { type: "Linear", color: "bg-rose-100", kind: "io", d: { out: 1000 } },
  { type: "Softmax", color: "bg-teal-100", kind: "act", d: { dim: -1 } },
  { type: "ReLU", color: "bg-teal-100", kind: "act", d: {} },
  { type: "GELU", color: "bg-teal-100", kind: "act", d: {} },
];

const TEMPLATES: Record<string, { nodes: any[]; edges: number[][] }> = {
  "GPT (Decoder-only)": {
    nodes: [
      { type: "Embedding", props: { dim: 768 }, x: 100, y: 100 },
      { type: "Positional Encoding", props: { max_len: 2048 }, x: 100, y: 250 },
      { type: "Multi-Head Attention", props: { heads: 12, dim: 768 }, x: 100, y: 400 },
      { type: "Feed-Forward", props: { d_ff: 3072 }, x: 100, y: 550 },
      { type: "LayerNorm", props: {}, x: 100, y: 700 },
      { type: "Linear", props: { out: 50257 }, x: 100, y: 850 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
  },
  "BERT (Encoder-only)": {
    nodes: [
      { type: "Embedding", props: { dim: 768 }, x: 100, y: 100 },
      { type: "Positional Encoding", props: { max_len: 512 }, x: 100, y: 250 },
      { type: "Multi-Head Attention", props: { heads: 12, dim: 768 }, x: 100, y: 400 },
      { type: "LayerNorm", props: {}, x: 100, y: 550 },
      { type: "Feed-Forward", props: { d_ff: 3072 }, x: 100, y: 700 },
      { type: "Pooling", props: { mode: "cls" }, x: 100, y: 850 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
  },
};

const MODEL_LIBRARY: Record<string, {
  title: string;
  desc: string;
  primary?: { name: string; url: string };
  variants?: { name: string; url: string }[];
}> = {
  "GPT (Decoder-only)": {
    title: "GPT（Decoder-only）",
    desc: "通用生成：对话、代码、写作、Agent。",
    primary: { name: "Brown et al., 2020 — GPT-3", url: "https://arxiv.org/abs/2005.14165" },
  },
  "BERT (Encoder-only)": {
    title: "BERT（Encoder-only）",
    desc: "判别/检索：分类、抽取式问答、向量检索。",
    primary: { name: "Devlin et al., 2018 — BERT", url: "https://arxiv.org/abs/1810.04805" },
  },
};

const MODEL_LINKS: Record<string, { github?: string; hf?: string; ms?: string }> = {
  "GPT (Decoder-only)": { github: "https://github.com/karpathy/nanoGPT", hf: "https://huggingface.co/gpt2" },
  "BERT (Encoder-only)": { github: "https://github.com/google-research/bert", hf: "https://huggingface.co/bert-base-uncased" },
  "T5 (Seq2Seq)": {
    github: "https://github.com/google-research/text-to-text-transfer-transformer",
    hf: "https://huggingface.co/t5-base",
  },
  CLIP: { github: "https://github.com/openai/CLIP", hf: "https://huggingface.co/openai/clip-vit-base-patch32" },
  "Stable Diffusion": {
    github: "https://github.com/CompVis/stable-diffusion",
    hf: "https://huggingface.co/runwayml/stable-diffusion-v1-5",
  },
};


// ===== 辅助函数 =====
const uid = () => Math.random().toString(36).slice(2, 10);

const snapToGrid = (v: number, grid: number) => Math.round(v / grid) * grid;

function explain(nodes: any[], edges: number[][]) {
  if (nodes.length === 0) {
    return {
      headline: "空画布",
      summary: "尚未添加任何模块",
      traits: [],
      apps: [],
      warnings: [],
    };
  }

  const hasAttn = nodes.some((n) => n.type.includes("Attention"));
  const hasFfn = nodes.some((n) => n.type.includes("Feed-Forward"));
  const hasEmb = nodes.some((n) => n.type.includes("Embedding"));

  let headline = "自定义架构";
  let summary = `包含 ${nodes.length} 个模块`;
  const traits: string[] = [];
  const apps: string[] = [];
  const warnings: string[] = [];

  if (hasAttn && hasFfn && hasEmb) {
    headline = "类 Transformer 架构";
    traits.push("自注意力", "前馈网络", "位置编码");
    apps.push("序列建模", "机器翻译", "文本生成");
  }

  if (edges.length === 0 && nodes.length > 1) {
    warnings.push("模块间无连接");
  }

  return { headline, summary, traits, apps, warnings };
}

function clampToCanvas(x: number, y: number) {
  const canvasW = 1500;
  const canvasH = 1000;
  const maxX = Math.max(0, canvasW - NODE_W);
  const maxY = Math.max(0, canvasH - NODE_H);
  return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
}

// ===== DnD helpers =====
function PaletteItem({ item }: { item: any }) {
  const [mounted, setMounted] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: { fromPalette: true, item },
  });

  // 添加挂载检查
  useEffect(() => {
    setMounted(true);
  }, []);

  const style: React.CSSProperties = {
    transform: isDragging ? undefined : transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.3 : 1,
    cursor: "grab",
  };

  const color = MODULE_TYPES.find((m) => m.type === item.type)?.color || "bg-slate-100";

  // 如果还没挂载，返回一个静态版本（不包含 dnd 属性）
  if (!mounted) {
    return (
        <div className={`${color} border rounded-lg p-2 text-center text-xs font-medium shadow-sm cursor-grab`}>
          {item.type}
        </div>
    );
  }

  // 挂载后返回完整的可拖拽版本
  return (
      <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={`${color} border rounded-lg p-2 text-center text-xs font-medium shadow-sm`}>
        {item.type}
      </div>
  );
}

// ===== 组件：网格背景 =====
function GridBackground() {
  return (
      <div className="absolute inset-0 pointer-events-none">
        <div
            className="w-full h-full"
            style={{
              backgroundImage: `
            linear-gradient(to right, #e5e7eb 1px, transparent 1px),
            linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
          `,
              backgroundSize: `${GRID}px ${GRID}px`,
            }}
        />
      </div>
  );
}

// ===== 组件：画布节点 =====
function CanvasNode({
                      node,
                      color,
                      selected,
                      onSelect,
                      onRemove,
                      onInfo,
                      onClick,
                      linkMode,
                      isSource,
                      isHot,
                      onHoverIn,
                      onHoverOut,
                    }: any) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: node.id });
  const style: React.CSSProperties = {
    transform: transform
        ? `translate3d(${(node.x ?? 0) + transform.x}px, ${(node.y ?? 0) + transform.y}px, 0)`
        : `translate3d(${node.x ?? 0}px, ${node.y ?? 0}px, 0)`,
  };
  return (
      <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          onMouseEnter={() => onHoverIn?.()}
          onMouseLeave={() => onHoverOut?.()}
          style={style}
          className={`absolute select-none ${color} w-[200px] rounded-xl border shadow-sm ${
              selected ? "ring-2 ring-blue-400" : ""
          } ${linkMode ? (isSource ? "ring-2 ring-sky-500" : isHot ? "ring-2 ring-sky-300" : "ring-1 ring-sky-200") : ""} ${
              linkMode ? "cursor-pointer" : ""
          }`}
      >
        <div className="h-[32px] px-3 flex items-center justify-between border-b">
          <div
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.();
              }}
              className="font-medium text-sm cursor-pointer truncate"
          >
            {node.type}
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                    className="p-1 rounded hover:bg-white/60"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInfo?.(e);
                    }}
                >
                  <Info className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>说明</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                    className="p-1 rounded hover:bg-white/60"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove?.();
                    }}
                >
                  <X className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>删除</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {linkMode && (
            <>
              <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border shadow flex items-center justify-center pointer-events-none">
                <ArrowLeft className="w-3 h-3" />
              </div>
              <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border shadow flex items-center justify-center pointer-events-none">
                <ArrowRight className="w-3 h-3" />
              </div>
            </>
        )}
        <div className="p-3 text-xs text-slate-700 space-y-1">
          {Object.keys(node.props || {})
              .slice(0, 4)
              .map((k) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-mono">{String((node.props as any)[k])}</span>
                  </div>
              ))}
        </div>
      </div>
  );
}

// ===== 组件：模块参数表单 =====
function ModuleForm({ node, onChange }: { node: any; onChange: (patch: any) => void }) {
  if (!node) return null;
  const entries = Object.entries(node.props || {});

  const parseMaybeNumber = (v: string) =>
      /^\d+(\.\d+)?$/.test(v) ? Number(v) : v === "true" ? true : v === "false" ? false : v;

  return (
      <div className="space-y-2">
        {entries.length === 0 && <div className="text-xs text-slate-500">该模块暂无可编辑参数</div>}
        {entries.map(([k, v]: any) => (
            <div key={k} className="flex items-center gap-2">
              <div className="w-28 text-xs text-slate-500">{k}</div>
              <Input
                  value={String(v)}
                  onChange={(e) => onChange({ [k]: parseMaybeNumber(e.target.value) })}
              />
            </div>
        ))}
      </div>
  );
}

// ===== 组件：模块知识展示 =====
function ModuleKnowledgePanel({ moduleType }: { moduleType: string }) {
  const knowledge = MODULE_KNOWLEDGE[moduleType];

  if (!knowledge) {
    return (
        <div className="text-sm text-slate-500 text-center py-8">
          该模块类型暂无知识库内容
        </div>
    );
  }

  return (
      <Accordion type="single" collapsible className="w-full">
        {knowledge.principle && (
            <AccordionItem value="principle">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-base">📐</span>
                  <span>原理深入</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-xs">{knowledge.principle}</pre>
                </div>
                <Button variant="link" size="sm" className="mt-2 p-0 h-auto text-xs">
                  查看完整文档 →
                </Button>
              </AccordionContent>
            </AccordionItem>
        )}

        {knowledge.training && (
            <AccordionItem value="training">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎯</span>
                  <span>训练策略</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-xs">{knowledge.training}</pre>
                </div>
              </AccordionContent>
            </AccordionItem>
        )}

        {knowledge.demo && (
            <AccordionItem value="demo">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-base">✨</span>
                  <span>效果演示</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-xs">{knowledge.demo}</pre>
                </div>
              </AccordionContent>
            </AccordionItem>
        )}
      </Accordion>
  );
}

// ===== 主组件 =====
export default function Page() {
  // 状态管理
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<number[][]>([]);
  const [filter, setFilter] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [fromId, setFromId] = useState<string | null>(null);
  const [tpl, setTpl] = useState("GPT (Decoder-only)");
  const [snap, setSnap] = useState(true);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [activeDrag, setActiveDrag] = useState<any | null>(null);
  const [dragFromPalette, setDragFromPalette] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"module" | "model" | "tools">("module");
  const [modelMeta, setModelMeta] = useState<{
    name: string;
    notes: string;
    author?: string;
    version?: string;
  }>({ name: "My Design", notes: "", author: "", version: "1.0" });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState(false);
  const [smartImportOpen, setSmartImportOpen] = useState(false);

  const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
      useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
      useSensor(TouchSensor, {
        activationConstraint: {
          delay: 120,
          tolerance: 5,
        },
      })
  );

  const filtered = MODULE_TYPES.filter(
      (m) =>
          m.type.toLowerCase().includes(filter.toLowerCase()) ||
          m.kind.toLowerCase().includes(filter.toLowerCase())
  );

  const selectedNode = useMemo(() => nodes.find((n) => n.id === sel) || null, [nodes, sel]);
  const ex = useMemo(() => explain(nodes, edges), [nodes, edges]);

  const ensureProjectId = useCallback(() => {
    const url = new URL(location.href);
    let id = url.searchParams.get("p");

    if (!id) {
      // 先尝试从 localStorage 读取上次的 projectId
      const lastProjectId = localStorage.getItem("lastProjectId");
      if (lastProjectId) {
        id = lastProjectId;
      } else {
        // 如果也没有，才生成新的
        id = Math.random().toString(36).slice(2, 8);
      }
      url.searchParams.set("p", id);
      history.replaceState(null, "", url.toString());
    }

    // 记住这次使用的 projectId
    localStorage.setItem("lastProjectId", id);
    return id;
  }, []);

  // Page 中准备 convId，并传给 ChatPanel
  const ensureConversationId = () => {
    const url = new URL(location.href);
    let id = url.searchParams.get("c");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      url.searchParams.set("c", id);
      history.replaceState(null, "", url.toString());
    }
    return id;
  };
  const convId = useMemo(() => (typeof window !== "undefined" ? ensureConversationId() : ""), []);

  const screenToCanvas = (screenX: number, screenY: number) => {
    const canvas = document.getElementById("canvas-root");
    if (!canvas) return { x: screenX, y: screenY };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (screenX - rect.left - pan.x) / zoom,
      y: (screenY - rect.top - pan.y) / zoom,
    };
  };

  // 自动切换到模块标签当选中节点时
  useEffect(() => {
    if (selectedNode) {
      setRightTab("module");
    }
  }, [selectedNode]);

  // 加载模板
  const loadTemplate = (name: string) => {
    setTpl(name);
    const t = TEMPLATES[name];
    if (!t) return;
    setNodes(t.nodes.map((n) => ({ ...n, id: uid(), props: { ...n.props } })));
    setEdges(t.edges);
    setSel(null);
  };

  // 导出/导入
  const handleExport = () => {
    const data = { nodes, edges, meta: modelMeta };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${modelMeta.name || "model"}.json`;
    a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
        setModelMeta(data.meta || { name: "Imported Model", notes: "" });
      } catch (err) {
        alert("导入失败");
      }
    };
    reader.readAsText(file);
  };

  function pointerFromEvent(event: any) {
    const startX = event.activatorEvent?.clientX ?? 0;
    const startY = event.activatorEvent?.clientY ?? 0;
    return { x: startX + (event.delta?.x || 0) + window.scrollX, y: startY + (event.delta?.y || 0) + window.scrollY };
  }
  function insideCanvas(px: number, py: number) {
    const r = document.getElementById("canvas-root")?.getBoundingClientRect();
    if (!r) return false;
    return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
  }

  // 拖放处理
  function handleDragStart(e: any) {
    setActiveDrag(e.active);
    const fromCanvas = e.active.data?.current?.fromCanvas;
    setDragFromPalette(!fromCanvas);
  };

  function handleDragMove(e: any) {
    const { active, delta } = e;
    if (!active?.id || active?.data?.current?.fromPalette) {
      setGuides({ x: null, y: null });
      return;
    }
    const cur = nodes.find((n) => n.id === active.id);
    if (!cur) {
      setGuides({ x: null, y: null });
      return;
    }
    const nx = (cur.x ?? 0) + (delta?.x || 0);
    const ny = (cur.y ?? 0) + (delta?.y || 0);
    const { x, y } = clampToCanvas(nx, ny);
    const th = 8;
    let gx: null | number = null,
        gy: null | number = null;
    const others = nodes
        .filter((n) => n.id !== cur.id)
        .map((n) => ({
          left: n.x,
          cx: n.x + NODE_W / 2,
          right: n.x + NODE_W,
          top: n.y,
          cy: n.y + HDR_H,
          bottom: n.y + NODE_H,
        }));
    const xOpts = [x, x + NODE_W / 2, x + NODE_W];
    const yOpts = [y, y + HDR_H, y + NODE_H];
    for (const c of others) {
      for (const xx of [c.left, c.cx, c.right]) {
        if (xOpts.some((xo) => Math.abs(xo - xx) <= th)) {
          gx = xx;
          break;
        }
      }
      for (const yy of [c.top, c.cy, c.bottom]) {
        if (yOpts.some((yo) => Math.abs(yo - yy) <= th)) {
          gy = yy;
          break;
        }
      }
    }
    setGuides({ x: gx, y: gy });
  }

  function handleDragEnd(e: any) {
    const { active, delta } = e;
    if (active?.data?.current?.fromPalette) {
      const p = pointerFromEvent(e);
      if (!insideCanvas(p.x, p.y)) {
        setActiveDrag(null);
        setDragFromPalette(false);
        return;
      }
      // const box = document.getElementById("canvas-root")!.getBoundingClientRect();
      // const lx = p.x - box.left - NODE_W / 2;
      // const ly = p.y - box.top - NODE_H / 2;
      // let { x, y } = clampToCanvas(lx, ly);
      // 修改这里：使用 screenToCanvas 转换坐标
      const canvasPos = screenToCanvas(p.x, p.y);
      let { x, y } = clampToCanvas(canvasPos.x - NODE_W / 2, canvasPos.y - NODE_H / 2);
      if (snap) {
        x = Math.round(x / GRID) * GRID;
        y = Math.round(y / GRID) * GRID;
      }
      const item = e.active.data.current.item;
      const def = MODULE_TYPES.find((m) => m.type === item.type);
      setNodes((prev) => [...prev, { id: uid(), type: item.type, props: { ...(def?.d || {}) }, x, y }]);
      setActiveDrag(null);
      setDragFromPalette(false);
      return;
    }
    if (!active?.id) {
      setActiveDrag(null);
      setDragFromPalette(false);
      return;
    }
    setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== active.id) return n;
          let nx = (n.x ?? 0) + (delta?.x || 0);
          let ny = (n.y ?? 0) + (delta?.y || 0);
          let { x, y } = clampToCanvas(nx, ny);
          if (snap) {
            x = Math.round(x / GRID) * GRID;
            y = Math.round(y / GRID) * GRID;
            if (guides.x !== null) {
              const mid = x + NODE_W / 2;
              if (Math.abs(mid - guides.x) <= 8) x += guides.x - mid;
              else if (Math.abs(x - guides.x) <= 8) x = guides.x;
              else if (Math.abs(x + NODE_W - guides.x) <= 8) x = guides.x - NODE_W;
            }
            if (guides.y !== null) {
              const midy = y + HDR_H;
              if (Math.abs(midy - guides.y) <= 8) y += guides.y - midy;
              else if (Math.abs(y - guides.y) <= 8) y = guides.y;
              else if (Math.abs(y + NODE_H - guides.y) <= 8) y = guides.y - NODE_H;
            }
          }
          return { ...n, x, y };
        })
    );
    setGuides({ x: null, y: null });
    setActiveDrag(null);
    setDragFromPalette(false);
  }

  // 连线模式
  const handleNodeClick = (nodeId: string) => {
    if (!linkMode) {
      setSel(nodeId);
      return;
    }

    if (!fromId) {
      setFromId(nodeId);
      return;
    }

    const fromIdx = nodes.findIndex((n) => n.id === fromId);
    const toIdx = nodes.findIndex((n) => n.id === nodeId);

    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
      const exists = edges.some(([f, t]) => f === fromIdx && t === toIdx);
      if (!exists) {
        setEdges((prev) => [...prev, [fromIdx, toIdx]]);
      }
    }
  };

  // 键盘处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpacePressed(true);
      }
      if (e.key === "Escape") {
        setLinkMode(false);
        setFromId(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        const idx = nodes.findIndex((n) => n.id === sel);
        if (idx !== -1) {
          setNodes((prev) => prev.filter((_, i) => i !== idx));
          setEdges((prev) =>
              prev.filter(([f, t]) => f !== idx && t !== idx).map(([f, t]) => [f > idx ? f - 1 : f, t > idx ? t - 1 : t])
          );
          setSel(null);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [sel, nodes, edges]);


  // 初次加载：优先云端，其次本地缓存
  useEffect(() => {
    const id = ensureProjectId();
    (async () => {
      try {
        const r = await fetch(`/api/state/load?projectId=${id}`);
        const { data } = await r.json();
        if (data) {
          setNodes(data.nodes || []);
          setEdges(data.edges || []);
          setModelMeta(data.meta || { name: "My Design", notes: "" });
          return;
        }
      } catch {}
      try {
        const saved = localStorage.getItem("puzzle:state:" + id);
        if (saved) {
          const s = JSON.parse(saved);
          setNodes(s.nodes || []);
          setEdges(s.edges || []);
          setModelMeta(s.meta || { name: "My Design", notes: "" });
        }
      } catch {}
    })();
  }, [ensureProjectId]);

  // 变更后自动保存（600ms 防抖）：写云端，同时写本地兜底
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("p");
    if (!id) return;
    const payload = { projectId: id, data: { nodes, edges, meta: modelMeta } };
    const t = setTimeout(() => {
      fetch("/api/state/save", { method: "POST", body: JSON.stringify(payload) }).catch(() => {});
      try { localStorage.setItem("puzzle:state:" + id, JSON.stringify(payload.data)); } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [nodes, edges, modelMeta]);

  useEffect(() => {
    loadTemplate(tpl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (fromId) setFromId(null);
        else if (linkMode) setLinkMode(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fromId, linkMode]);

  // Self-tests (development only)
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    try {
      // edges validity
      edges.forEach(([f, t]) => {
        if (typeof f !== "number" || typeof t !== "number") throw new Error("Edge indices must be numbers");
        if (f === t) throw new Error("Self-loop edge is not allowed");
        if (f < 0 || f >= nodes.length || t < 0 || t >= nodes.length) throw new Error("Edge index out of range");
      });
      // nodes shape & notes type
      nodes.forEach((n) => {
        if (!n.id || !n.type) throw new Error("Node missing required fields");
        if (typeof (n as any).notes !== "undefined" && typeof (n as any).notes !== "string")
          throw new Error("Node.notes must be a string when present");
      });
      // no duplicate edges
      const edgeKeys = new Set<string>();
      edges.forEach((e) => {
        const k = e.join("-");
        if (edgeKeys.has(k)) throw new Error("Duplicate edge detected");
        edgeKeys.add(k);
      });
      // components
      console.assert(typeof PaletteItem === "function", "PaletteItem should be defined");
      // console.assert(typeof ChatPanel === "function", "ChatPanel should be defined");
      // presence of canvas root
      console.assert(!!document.getElementById("canvas-root"), "canvas-root should exist");
      // eslint-disable-next-line no-console
      console.debug("[SelfTests] PASS");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[SelfTests] FAIL", err);
    }
  }, [nodes, edges]);

  // 画布交互
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (spacePressed) {
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.min(Math.max(zoom + delta, 0.5), 2);
    setZoom(newZoom);
  };

  const handlePanMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handlePanEnd = () => {
    setIsPanning(false);
  };

  // 统计模块分布
  const moduleDistribution = useMemo(() => {
    return nodes.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [nodes]);

  function importJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const data = JSON.parse(String(ev.target?.result || ""));
        if (Array.isArray(data.nodes) && Array.isArray(data.edges)) {
          setNodes(data.nodes);
          setEdges(data.edges);
          if (data.meta) {
            setModelMeta({ name: data.meta.name || modelMeta.name, notes: data.meta.notes || modelMeta.notes });
          }
        }
      } catch {}
    };
    r.readAsText(file);
  }

  function exportJSON() {
    const data = { meta: modelMeta, nodes, edges };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `model-puzzle-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function removeNode(id: string) {
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx < 0) return;
    setNodes((p) => p.filter((n) => n.id !== id));
    setEdges((p) => p.filter(([f, t]) => f !== idx && t !== idx).map(([f, t]) => [f - (f > idx ? 1 : 0), t - (t > idx ? 1 : 0)]));
    if (sel === id) setSel(null);
  }

  function addEdge(a: string | null, b: string | null) {
    if (!a || !b || a === b) return;
    const i = nodes.findIndex((n) => n.id === a),
        j = nodes.findIndex((n) => n.id === b);
    if (i < 0 || j < 0) return;
    if (edges.some(([f, t]) => f === i && t === j)) return;
    setEdges((e) => [...e, [i, j]]);
  }

  const handleZoom = (delta: number, centerX?: number, centerY?: number) => {
    setZoom((prevZoom) => {
      const newZoom = Math.min(Math.max(prevZoom + delta, 0.5), 2);
      if (centerX !== undefined && centerY !== undefined) {
        const canvas = document.getElementById("canvas-root");
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const x = centerX - rect.left;
          const y = centerY - rect.top;
          setPan((prevPan) => ({
            x: prevPan.x - (x * (newZoom - prevZoom)) / prevZoom,
            y: prevPan.y - (y * (newZoom - prevZoom)) / prevZoom,
          }));
        }
      }
      return newZoom;
    });
  };

  const handleFitToScreen = () => {
    const canvas = document.getElementById("canvas-root");
    if (!canvas || nodes.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const bounds = nodes.reduce(
        (acc, n) => ({
          minX: Math.min(acc.minX, n.x),
          minY: Math.min(acc.minY, n.y),
          maxX: Math.max(acc.maxX, n.x + NODE_W),
          maxY: Math.max(acc.maxY, n.y + NODE_H),
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );
    const contentW = bounds.maxX - bounds.minX;
    const contentH = bounds.maxY - bounds.minY;
    const scaleX = (rect.width * 0.9) / contentW;
    const scaleY = (rect.height * 0.9) / contentH;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.5), 2);
    const newPan = {
      x: (rect.width - contentW * newZoom) / 2 - bounds.minX * newZoom,
      y: (rect.height - contentH * newZoom) / 2 - bounds.minY * newZoom,
    };
    setZoom(newZoom);
    setPan(newPan);
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  function handleSmartImport(result: {
    nodes: any[];
    edges: number[][];
    meta?: { name?: string; notes?: string };
  }) {
    // 为导入的节点生成新的 ID 和位置
    const offsetX = 100;
    const offsetY = 100;
    const spacing = 250;

    const newNodes = result.nodes.map((node, idx) => ({
      ...node,
      id: uid(),
      x: offsetX + (idx % 3) * spacing,
      y: offsetY + Math.floor(idx / 3) * 150,
    }));

    // 添加到现有画布
    setNodes((prev) => [...prev, ...newNodes]);

    // 添加边（需要调整索引以匹配新节点）
    const baseIndex = nodes.length;
    const newEdges = result.edges.map(([from, to]) => [
      baseIndex + from,
      baseIndex + to,
    ]);
    setEdges((prev) => [...prev, ...newEdges]);

    // 更新模型元信息（如果提供）
    if (result.meta) {
      setModelMeta((prev) => ({
        name: result.meta?.name || prev.name,
        notes: prev.notes
            ? `${prev.notes}\n\n导入备注：\n${result.meta?.notes || ""}`
            : result.meta?.notes || prev.notes,
      }));
    }
  }

  return (
      <TooltipProvider>
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setGuides({ x: null, y: null })}
        >
          <div className="h-screen flex flex-col bg-slate-50">
            {/* 顶部工具栏 */}
            <div className="h-14 border-b bg-white flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-blue-600" />
                <span className="font-bold text-lg">AI Model Builder</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSmartImportOpen(true)}>
                  <Wand2 className="w-4 h-4 mr-2" />
                  智能导入
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="w-4 h-4 mr-2" />
                  导出
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <label>
                    <Upload className="w-4 h-4 mr-2" />
                    导入
                    <input type="file" accept=".json" className="hidden" onChange={handleImport} />
                  </label>
                </Button>
              </div>
            </div>

            {/* 主内容区 */}
            <div className="flex-1 grid grid-cols-[320px_1fr_380px] overflow-hidden">
              {/* 左侧：模块库 */}
              <div className="min-h-0 bg-slate-50 overflow-y-auto p-4">
                {/* Left */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5"/>
                    <div className="font-semibold">模块库</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative w-full">
                      <Search className="absolute left-2 top-2.5 w-4 h-4 text-slate-400"/>
                      <Input
                          placeholder="搜索类型 / kind..."
                          className="pl-8"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                      />
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" onClick={() => setFilter("")}>
                          ×
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>清空</TooltipContent>
                    </Tooltip>
                  </div>
                  {/* ===== 新增：智能导入按钮 ===== */}
                  <div className="rounded-lg border bg-gradient-to-r from-purple-50 to-blue-50 p-3">
                    <Button
                        variant="outline"
                        className="w-full gap-2 bg-white hover:bg-slate-50"
                        onClick={() => setSmartImportOpen(true)}
                    >
                      <Wand2 className="w-4 h-4 text-purple-500"/>
                      <span>智能导入</span>
                      <Badge variant="secondary" className="ml-auto text-xs">
                        AI
                      </Badge>
                    </Button>
                    <p className="text-[11px] text-slate-600 mt-2 text-center">
                      从 GitHub 或 PDF 自动生成模块
                    </p>
                  </div>
                  {/* ===== 智能导入按钮结束 ===== */}
                  <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-auto pr-1">
                    {filtered.map((it) => (
                        <PaletteItem key={it.type} item={it}/>
                    ))}
                  </div>

                  <ModelLibrary
                      modelLibrary={MODEL_LIBRARY}
                      modelLinks={MODEL_LINKS}
                      onLoadTemplate={loadTemplate}
                  />

                  <Tabs value={tpl} className="mt-2">
                    <TabsList className="flex flex-wrap gap-2">
                      {Object.keys(TEMPLATES).map((k) => (
                          <TabsTrigger key={k} value={k} onClick={() => loadTemplate(k)} className="text-xs">
                            {k}
                          </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              {/* Center */}
              <div className="relative min-h-0 overflow-y-auto p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5"/>
                    <div className="font-semibold">拼装画布</div>
                    <div className="text-xs text-slate-500 ml-2">拖拽模块；连线模式：先点“源”，再可连续点多个“目标”；按 Esc
                      取消当前源；按空格+鼠标左键拖拽画布；鼠标滚轮缩放
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span>对齐</span>
                      <Switch checked={snap} onCheckedChange={setSnap}/>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                            variant={linkMode ? "default" : "outline"}
                            size="sm"
                            className="gap-2"
                            onClick={() => {
                              setLinkMode((v) => !v);
                              setFromId(null);
                            }}
                        >
                          <Link2 className="w-4 h-4"/>
                          连线
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>连线模式：先点源，再连续点多个目标；Esc 取消源</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2" onClick={exportJSON}>
                          <Download className="w-4 h-4"/>
                          导出
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>导出当前画布的 JSON（nodes + edges + meta）</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label
                            className="inline-flex items-center gap-2 cursor-pointer border rounded-md px-3 py-1.5 bg-white text-sm">
                          <Upload className="w-4 h-4"/>
                          导入
                          <Input type="file" accept="application/json" className="hidden" onChange={importJSON}/>
                        </label>
                      </TooltipTrigger>
                      <TooltipContent>导入先前导出的 JSON，恢复画布</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <div
                    id="canvas-root"
                    className={`relative h-[calc(100dvh-160px)] min-h-[640px] rounded-2xl bg-white shadow-inner border overflow-hidden ${
                        linkMode ? "cursor-crosshair" : isPanning ? "cursor-grabbing" : "cursor-grab"
                    }`}
                    onWheel={handleWheel}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={(e) => {
                      handlePanMove(e);
                      const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      setPointer({x: (e.clientX - r.left - pan.x) / zoom, y: (e.clientY - r.top - pan.y) / zoom});
                    }}
                    onMouseUp={handlePanEnd}
                    onMouseLeave={() => {
                      handlePanEnd();
                      setPointer(null);
                    }}
                    // onClick={() => setSel(null)}
                >
                  {/* 可缩放平移的内容容器 */}
                  <div
                      style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: "0 0",
                        width: "1500px",
                        height: "1000px",
                        position: "relative",
                        pointerEvents: isPanning ? "none" : "auto", // 平移时禁用内容的鼠标事件
                      }}
                      onClick={(e) => {
                        // 只有点击空白处才取消选择
                        if (e.target === e.currentTarget) {
                          setSel(null);
                        }
                      }}
                  >
                    <GridBackground/>

                    {/* guides */}
                    {guides.x !== null &&
                        <div className="absolute top-0 bottom-0 w-px bg-blue-400/60" style={{left: guides.x}}/>}
                    {guides.y !== null &&
                        <div className="absolute left-0 right-0 h-px bg-blue-400/60" style={{top: guides.y}}/>}

                    {/* edges */}
                    <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
                      {edges.map(([f, t], i) => {
                        const a = nodes[f],
                            b = nodes[t];
                        if (!a || !b) return null;
                        const x1 = a.x + NODE_W / 2,
                            y1 = a.y + HDR_H,
                            x2 = b.x + NODE_W / 2,
                            y2 = b.y + HDR_H,
                            mx = (x1 + x2) / 2;
                        return <path key={i} d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                                     stroke="#94a3b8"
                                     strokeWidth="2" fill="none" markerEnd="url(#arrow)"/>;
                      })}
                      {linkMode &&
                          fromId &&
                          pointer &&
                          (() => {
                            const a = nodes.find((n) => n.id === fromId);
                            if (!a) return null;
                            const x1 = a.x + NODE_W / 2,
                                y1 = a.y + HDR_H,
                                x2 = pointer.x,
                                y2 = pointer.y,
                                mx = (x1 + x2) / 2;
                            return <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} stroke="#60a5fa"
                                         strokeWidth="2" fill="none" strokeDasharray="6 6"/>;
                          })()}
                      <defs>
                        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6"
                                orient="auto-start-reverse">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"/>
                        </marker>
                      </defs>
                    </svg>

                    {/* nodes */}
                    {nodes.map((n) => (
                        <CanvasNode
                            key={n.id}
                            node={n}
                            color={MODULE_TYPES.find((m) => m.type === n.type)?.color}
                            selected={sel === n.id}
                            onSelect={() => setSel(n.id)}
                            onRemove={() => removeNode(n.id)}
                            onInfo={() => {
                            }}
                            linkMode={linkMode}
                            isSource={fromId === n.id}
                            isHot={hover === n.id}
                            onHoverIn={() => setHover(n.id)}
                            onHoverOut={() => setHover((prev) => (prev === n.id ? null : prev))}
                            onClick={() => {
                              if (linkMode) {
                                if (!fromId) {
                                  setFromId(n.id);
                                } else if (fromId !== n.id) {
                                  addEdge(fromId, n.id);
                                } else {
                                  setFromId(null);
                                }
                              } else {
                                setSel(n.id);
                              }
                            }}
                        />
                    ))}
                  </div>

                  {/* 缩放控制面板 - 添加在 canvas-root 内部，缩放容器外部 */}
                  <div
                      className="absolute bottom-4 right-4 flex flex-col gap-2 bg-white rounded-lg shadow-md p-2 border z-10">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleZoom(0.1)}
                            disabled={zoom >= 2}
                            className="h-8 w-8"
                        >
                          <Plus className="w-4 h-4"/>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>放大</TooltipContent>
                    </Tooltip>

                    <div className="text-xs text-center font-mono text-slate-600 py-1 select-none">
                      {Math.round(zoom * 100)}%
                    </div>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleZoom(-0.1)}
                            disabled={zoom <= 0.5}
                            className="h-8 w-8"
                        >
                          <Minus className="w-4 h-4"/>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>缩小</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleFitToScreen}
                            className="h-8 w-8"
                        >
                          <Maximize2 className="w-4 h-4"/>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>适应画布</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleResetView}
                            className="h-8 w-8"
                        >
                          <RotateCcw className="w-4 h-4"/>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>重置视图</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>

              {/* 右侧：信息面板 */}
              <div className="min-h-0 border-l bg-white overflow-y-auto">
                <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as any)} className="h-full flex flex-col">
                  <TabsList className="grid grid-cols-3 w-full shrink-0">
                    <TabsTrigger value="module" className="flex items-center gap-1 text-xs">
                      <Box className="w-3 h-3"/>
                      模块
                    </TabsTrigger>
                    <TabsTrigger value="model" className="flex items-center gap-1 text-xs">
                      <Layers className="w-3 h-3"/>
                      模型
                    </TabsTrigger>
                    <TabsTrigger value="tools" className="flex items-center gap-1 text-xs">
                      <Wand2 className="w-3 h-3"/>
                      工具
                    </TabsTrigger>
                  </TabsList>

                  {/* 模块标签 */}
                  <TabsContent value="module" className="flex-1 overflow-y-auto p-4 space-y-4">
                    {selectedNode ? (
                        <>
                          {/* 实例级内容 */}
                          <div className="pb-4 border-b">
                            <div className="text-xs text-slate-500 mb-1">当前选中</div>
                            <div className="text-lg font-semibold flex items-center gap-2">
                              {selectedNode.type}
                              <Badge variant="outline" className="text-xs">
                                #{nodes.findIndex((n) => n.id === selectedNode.id) + 1}
                              </Badge>
                            </div>
                          </div>

                          <Accordion type="multiple" defaultValue={["params", "notes"]} className="w-full">
                            <AccordionItem value="params">
                              <AccordionTrigger className="text-sm">⚙️ 实例参数</AccordionTrigger>
                              <AccordionContent>
                                <ModuleForm
                                    node={selectedNode}
                                    onChange={(patch: any) =>
                                        setNodes((prev) =>
                                            prev.map((n) => (n.id === sel ? {...n, props: {...n.props, ...patch}} : n))
                                        )
                                    }
                                />
                              </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="notes">
                              <AccordionTrigger className="text-sm">📝 实例说明</AccordionTrigger>
                              <AccordionContent>
                                <Textarea
                                    value={selectedNode.notes || ""}
                                    onChange={(e) =>
                                        setNodes((prev) =>
                                            prev.map((n) => (n.id === sel ? {...n, notes: e.target.value} : n))
                                        )
                                    }
                                    placeholder="为这个特定的模块实例添加说明..."
                                    className="min-h-[100px]"
                                />
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>

                          {/* 类型级知识 */}
                          <div className="pt-4 border-t">
                            <div className="text-xs text-slate-500 mb-3">模块类型知识库（通用）</div>
                            <ModuleKnowledgePanel moduleType={selectedNode.type}/>
                          </div>
                        </>
                    ) : (
                        <div className="text-center text-slate-400 py-12">
                          <Box className="w-12 h-12 mx-auto mb-4 opacity-50"/>
                          <p className="text-sm">点击画布上的模块以查看详情</p>
                        </div>
                    )}
                  </TabsContent>

                  {/* 模型标签 */}
                  <TabsContent value="model" className="flex-1 overflow-y-auto p-4">
                    <Accordion type="multiple" defaultValue={["meta", "stats"]} className="w-full">
                      <AccordionItem value="meta">
                        <AccordionTrigger className="text-sm">🏛️ 模型元信息</AccordionTrigger>
                        <AccordionContent className="space-y-3">
                          <div>
                            <label className="text-xs text-slate-500">名称</label>
                            <Input
                                value={modelMeta.name}
                                onChange={(e) => setModelMeta({...modelMeta, name: e.target.value})}
                                placeholder="模型名称"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">作者</label>
                            <Input
                                value={modelMeta.author || ""}
                                onChange={(e) => setModelMeta({...modelMeta, author: e.target.value})}
                                placeholder="作者"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">版本</label>
                            <Input
                                value={modelMeta.version || ""}
                                onChange={(e) => setModelMeta({...modelMeta, version: e.target.value})}
                                placeholder="版本号"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">整体说明</label>
                            <Textarea
                                value={modelMeta.notes}
                                onChange={(e) => setModelMeta({...modelMeta, notes: e.target.value})}
                                placeholder="模型整体说明..."
                                className="min-h-[120px]"
                            />
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="stats">
                        <AccordionTrigger className="text-sm">📊 架构统计</AccordionTrigger>
                        <AccordionContent className="space-y-3">
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span>模块总数</span>
                              <Badge>{nodes.length}</Badge>
                            </div>
                            <div className="flex justify-between">
                              <span>连接数</span>
                              <Badge>{edges.length}</Badge>
                            </div>
                          </div>

                          <div className="mt-4">
                            <div className="text-xs text-slate-500 mb-2">模块分布</div>
                            <div className="space-y-1">
                              {Object.entries(moduleDistribution).map(([type, count]) => (
                                  <div key={type} className="flex justify-between text-xs">
                                    <span>{type}</span>
                                    <span className="font-mono">{String(count)}</span>
                                  </div>
                              ))}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="validation">
                        <AccordionTrigger className="text-sm">✅ 架构检查</AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3">
                            <div>
                              <div className="font-medium text-sm mb-1">{ex.headline}</div>
                              <div className="text-xs text-slate-600">{ex.summary}</div>
                            </div>

                            {ex.traits.length > 0 && (
                                <div>
                                  <div className="text-xs text-slate-500 mb-1">特征</div>
                                  <div className="flex flex-wrap gap-1">
                                    {ex.traits.map((t, i) => (
                                        <Badge key={i} variant="secondary" className="text-xs">
                                          {t}
                                        </Badge>
                                    ))}
                                  </div>
                                </div>
                            )}

                            {ex.warnings.length > 0 && (
                                <div>
                                  <div className="text-xs text-slate-500 mb-1">警告</div>
                                  {ex.warnings.map((w, i) => (
                                      <div key={i} className="text-xs text-amber-600">
                                        ⚠️ {w}
                                      </div>
                                  ))}
                                </div>
                            )}

                            {ex.warnings.length === 0 && nodes.length > 0 && (
                                <div className="text-xs text-green-600">✓ 架构验证通过</div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </TabsContent>

                  {/* 工具标签 */}
                  <TabsContent value="tools" className="flex-1 overflow-y-auto p-4">
                    <div className="text-center text-slate-400 py-12">
                      <Wand2 className="w-12 h-12 mx-auto mb-4 opacity-50"/>
                      <p className="text-sm">AI Chat 和其他工具即将到来</p>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>

          {/* 智能导入对话框 */}
          <SmartImportDialog
              open={smartImportOpen}
              onOpenChange={setSmartImportOpen}
              onImport={handleSmartImport}
          />

          <DragOverlay dropAnimation={null}>
            {activeDrag && dragFromPalette && (() => {
              const item = activeDrag.data?.current?.item;
              if (!item) return null;
              const color = MODULE_TYPES.find((m) => m.type === item.type)?.color;
              return (
                  <div className={`w-[200px] ${color} border rounded-xl shadow-lg`}>
                    <div className="h-[32px] px-3 flex items-center font-medium text-sm">{item.type}</div>
                    <div className="p-3 text-xs text-slate-600">从面板拖拽</div>
                  </div>
              );
            })()}
          </DragOverlay>
        </DndContext>
      </TooltipProvider>
  );
}
