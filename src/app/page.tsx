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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  Plus,        // 新增
  Minus,       // 新增
  Maximize2,   // 新增
  RotateCcw,   // 新增
} from "lucide-react";

/**
 * AI Model Puzzle Builder — Single-file page.tsx
 * - 左侧：模块库与模板；中间：画布；右侧：说明与属性 + AI Chat。
 * - 特性：满屏布局、对齐吸附 & 参考线、连线预览、论文链接胶囊样式、内置本地检索 Chat。
 *
 * 修复&新增：
 * 1) 确保 <DndContext> 与所有 <Card>/<CardContent> 均正确闭合；
 * 2) 定义缺失的 <PaletteItem>；
 * 3) 右侧新增 “AI Chat” 标签页，可在站内检索模块/模型并一键写入备注。
 */

// ===== Constants =====
const GRID = 80; // 网格尺寸
const NODE_W = 200;
const NODE_H = 110;
const HDR_H = 32;

const MODULE_TYPES = [
  { type: "Tokenizer", color: "bg-emerald-100", kind: "io", d: { vocab: 32000, model: "BPE" } },
  { type: "Embedding", color: "bg-emerald-100", kind: "core", d: { dim: 768 } },
  { type: "PositionalEncoding", color: "bg-emerald-100", kind: "core", d: { scheme: "rotary" } },
  { type: "TransformerEncoder", color: "bg-indigo-100", kind: "encoder", d: { layers: 12, heads: 12, dim: 768 } },
  { type: "TransformerDecoder", color: "bg-purple-100", kind: "decoder", d: { layers: 12, heads: 12, dim: 768, causal: true } },
  { type: "Attention", color: "bg-purple-100", kind: "core", d: { heads: 12, dim: 768, causal: true } },
  { type: "FFN", color: "bg-purple-100", kind: "core", d: { mlp_ratio: 4 } },
  { type: "CrossAttention", color: "bg-amber-100", kind: "core", d: { heads: 8, dim: 768 } },
  { type: "VisionEncoder", color: "bg-sky-100", kind: "vision", d: { backbone: "ViT-B/16", dim: 768 } },
  { type: "TextEncoder", color: "bg-sky-100", kind: "text", d: { backbone: "Transformer", dim: 768 } },
  { type: "UNet", color: "bg-rose-100", kind: "diffusion", d: { channels: 4, depth: 4 } },
  { type: "VAE", color: "bg-rose-100", kind: "diffusion", d: { latent: 4 } },
  { type: "Scheduler", color: "bg-rose-100", kind: "diffusion", d: { type: "DDIM" } },
  { type: "ProjectionHead", color: "bg-amber-100", kind: "multimodal", d: { dim: 512 } },
  { type: "ContrastiveLoss", color: "bg-amber-100", kind: "loss", d: {} },
  { type: "LMHead", color: "bg-purple-100", kind: "head", d: { tied: true } },
  { type: "ClassifierHead", color: "bg-indigo-100", kind: "head", d: { classes: 2 } },
  { type: "Adapter/LoRA", color: "bg-lime-100", kind: "finetune", d: { r: 8, alpha: 16 } },
  { type: "Retriever", color: "bg-lime-100", kind: "tool", d: { topk: 5 } },
] as const;

const TEMPLATES: Record<string, () => { nodes: any[]; edges: number[][] }> = {
  "GPT (Decoder-only)": () => ({
    nodes: [
      n("Tokenizer"),
      n("Embedding", { dim: 4096 }),
      n("PositionalEncoding"),
      n("TransformerDecoder", { layers: 32, heads: 32, dim: 4096, causal: true }),
      n("LMHead"),
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  }),
  "BERT (Encoder-only)": () => ({
    nodes: [
      n("Tokenizer"),
      n("Embedding", { dim: 768 }),
      n("TransformerEncoder", { layers: 12, heads: 12, dim: 768 }),
      n("ClassifierHead", { classes: 2 }),
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  }),
  "T5 (Seq2Seq)": () => ({
    nodes: [
      n("Tokenizer"),
      n("Embedding", { dim: 1024 }),
      n("TransformerEncoder", { layers: 24, heads: 16, dim: 1024 }),
      n("TransformerDecoder", { layers: 24, heads: 16, dim: 1024, causal: true }),
      n("LMHead"),
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  }),
  CLIP: () => ({
    nodes: [
      n("VisionEncoder", { backbone: "ViT-B/16", dim: 512 }),
      n("TextEncoder", { dim: 512 }),
      n("ProjectionHead", { dim: 512 }),
      n("ProjectionHead", { dim: 512 }),
      n("ContrastiveLoss"),
    ],
    edges: [
      [0, 2],
      [1, 3],
      [2, 4],
      [3, 4],
    ],
  }),
  "Stable Diffusion": () => ({
    nodes: [
      n("TextEncoder", { backbone: "T5-base", dim: 768 }),
      n("UNet", { channels: 4, depth: 4 }),
      n("Scheduler", { type: "DDIM" }),
      n("VAE", { latent: 4 }),
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  }),
};

const MODEL_LIBRARY: Record<
  string,
  {
    title: string;
    desc: string;
    primary?: { name: string; url: string };
    variants?: { name: string; url: string }[];
  }
> = {
  "GPT (Decoder-only)": {
    title: "GPT（Decoder-only）",
    desc: "通用生成：对话、代码、写作、Agent。",
    primary: { name: "Brown et al., 2020 — GPT-3", url: "https://arxiv.org/abs/2005.14165" },
    variants: [
      { name: "InstructGPT, 2022", url: "https://arxiv.org/abs/2203.02155" },
      { name: "LLaMA, 2023", url: "https://arxiv.org/abs/2302.13971" },
    ],
  },
  "BERT (Encoder-only)": {
    title: "BERT（Encoder-only）",
    desc: "判别/检索：分类、抽取式问答、向量检索。",
    primary: { name: "Devlin et al., 2018 — BERT", url: "https://arxiv.org/abs/1810.04805" },
    variants: [
      { name: "RoBERTa, 2019", url: "https://arxiv.org/abs/1907.11692" },
      { name: "DeBERTa, 2021", url: "https://arxiv.org/abs/2006.03654" },
    ],
  },
  "T5 (Seq2Seq)": {
    title: "T5（Encoder–Decoder）",
    desc: "文本到文本：摘要、翻译、指令执行。",
    primary: { name: "Raffel et al., 2020 — T5", url: "https://jmlr.org/papers/v21/20-074.html" },
    variants: [{ name: "FLAN-T5, 2022", url: "https://arxiv.org/abs/2210.11416" }],
  },
  CLIP: {
    title: "CLIP（图文对比）",
    desc: "图文检索、零样本图像分类。",
    primary: { name: "Radford et al., 2021 — CLIP", url: "https://arxiv.org/abs/2103.00020" },
    variants: [{ name: "OpenCLIP", url: "https://github.com/mlfoundations/open_clip" }],
  },
  "Stable Diffusion": {
    title: "Stable Diffusion（潜空间扩散）",
    desc: "文生图、图生图、控制/风格化。",
    primary: { name: "Rombach et al., 2022 — LDM", url: "https://arxiv.org/abs/2112.10752" },
    variants: [{ name: "SDXL, 2023", url: "https://arxiv.org/abs/2307.01952" }],
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

// ===== Utils =====
const uid = () => Math.random().toString(36).slice(2, 9);
function n(type: string, props: Record<string, any> = {}) {
  const def = MODULE_TYPES.find((m) => m.type === type)?.d || {};
  return { id: uid(), type, props: { ...def, ...props }, x: 0, y: 0 };
}
// function clampToCanvas(x: number, y: number) {
//   const rect = document.getElementById("canvas-root")?.getBoundingClientRect();
//   if (!rect) return { x, y };
//   const maxX = Math.max(0, rect.width - NODE_W);
//   const maxY = Math.max(0, rect.height - NODE_H);
//   return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
// }
function clampToCanvas(x: number, y: number) {
  const canvasW = 3000;
  const canvasH = 2000;
  const maxX = Math.max(0, canvasW - NODE_W);
  const maxY = Math.max(0, canvasH - NODE_H);
  return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
}

// ===== DnD helpers =====
function PaletteItem({ item }: { item: any }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: { fromPalette: true, item },
  });
  const style: React.CSSProperties = {
    transform: isDragging ? undefined : transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0 : 1,
    touchAction: "none",
  };
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className={`cursor-grab ${item.color} border rounded-xl p-3 shadow-sm hover:shadow-md transition`}
    >
      <div className="text-xs text-slate-500">{item.kind}</div>
      <div className="font-semibold text-xs leading-tight break-words">{item.type}</div>
    </div>
  );
}

// ===== Tiny components =====
const GridBackground = () => (
  <div
    className="absolute inset-0"
    style={{
      backgroundImage: `radial-gradient(circle, rgba(148,163,184,.35) 1px, transparent 1px)`,
      backgroundSize: `${GRID}px ${GRID}px`,
      backgroundPosition: `calc(${GRID / 2}px) calc(${GRID / 2}px)`,
    }}
  />
);

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

function ModuleForm({ node, onChange }: any) {
  if (!node) return null;
  const entries = Object.entries(node.props || {});
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{node.type}</div>
      {entries.length === 0 && <div className="text-xs text-slate-500">该模块暂无可编辑参数</div>}
      {entries.map(([k, v]: any) => (
        <div key={k} className="flex items-center gap-2">
          <div className="w-28 text-xs text-slate-500">{k}</div>
          <Input value={String(v)} onChange={(e) => onChange({ [k]: parseMaybeNumber(e.target.value) })} />
        </div>
      ))}
    </div>
  );
}
const parseMaybeNumber = (v: string) =>
  /^\d+(\.\d+)?$/.test(v) ? Number(v) : v === "true" ? true : v === "false" ? false : v;

// ===== Heuristic explainer =====
function explain(nodes: any[], edges: any[]) {
  const has = (t: string) => nodes.some((n) => n.type === t);
  const out: string[] = [];
  const apps = new Set<string>();
  const traits = new Set<string>();
  if (has("TransformerDecoder") && !has("TransformerEncoder")) {
    out.push("Decoder-only transformer (GPT-style)");
    apps.add("Text generation");
    traits.add("Causal attention");
  }
  if (has("TransformerEncoder") && !has("TransformerDecoder")) {
    out.push("Encoder-only transformer (BERT-style)");
    apps.add("Classification / retrieval");
    traits.add("Bidirectional attention");
  }
  if (has("TransformerEncoder") && has("TransformerDecoder")) {
    out.push("Encoder–decoder transformer (T5)");
    apps.add("Translation / summarization");
    traits.add("Cross-attention");
  }
  if (has("UNet") && has("VAE") && has("Scheduler") && has("TextEncoder")) {
    out.push("Text-to-image diffusion (SD-like)");
    apps.add("Image generation");
    traits.add("Latent denoising");
  }
  if (has("VisionEncoder") && has("TextEncoder") && has("ContrastiveLoss")) {
    out.push("CLIP-style contrastive");
    apps.add("Image–text retrieval");
    traits.add("Shared embedding");
  }
  const enc = nodes.find((n) => n.type === "TransformerEncoder")?.props?.layers || 0;
  const dec = nodes.find((n) => n.type === "TransformerDecoder")?.props?.layers || 0;
  const dim = nodes.find((n) => ["TransformerEncoder", "TransformerDecoder"].includes(n.type))?.props?.dim;
  if (dim) traits.add(`Hidden size ≈ ${dim}`);
  if (enc + dec > 0) out.push(`Rough param proxy ≈ ${Math.round(((enc + dec) * (dim || 512) * 1.2) / 1e3)}M`);
  return { headline: out[0] || "Custom architecture", apps: [...apps], traits: [...traits], summary: `${nodes.length} modules, ${edges.length} links` };
}

// ===== Simple local AI Chat (search-based) =====
function ChatPanel({ conversationId,
                     canInsertModule,
                     onInsertModel,
                     onInsertModule,
                     selectedNodeType,
                     modelMeta,     // 新增
                     nodes,         // 新增
                     edges,         // 新增
                   }: {
  conversationId?: string;
  canInsertModule: boolean;
  onInsertModel: (t: string) => void;
  onInsertModule: (t: string) => void;
  selectedNodeType?: string | null;
  modelMeta: { name: string; notes?: string };
  nodes: any[];
  edges: number[][];
}) {
  type Msg = { role: "user" | "assistant" | "search"; content: string };
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: '👋 我可以帮你查找模块/模型，并把结果整理进备注。试着问："LoRA 是什么？" 或 "搜索 TransformerDecoder 的论文"。' },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  // 1) 加载历史
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      const r = await fetch(`/api/chat/history?conversationId=${conversationId}`);
      const { messages: hist } = await r.json();
      if (Array.isArray(hist) && hist.length) setMessages(hist);
    })();
  }, [conversationId]);

  // 2) 在你完成一次AI回复后写回（无论你是本地检索或流式AI）
  async function persistPair(userText: string, assistantText: string) {
    if (!conversationId) return;
    await fetch("/api/chat/append", {
      method: "POST",
      body: JSON.stringify({
        conversationId,
        messages: [
          { role: "user", content: userText },
          { role: "assistant", content: assistantText },
        ],
      }),
    });
  }

  // 4) 如果是“流式 AI”版本，在流结束时：
  // await persistPair(userText, finalAssistantText);

  function summarizeModule(m: any) {
    const kv = Object.entries(m.d || {})
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    return `• ${m.type} (${m.kind}) — ${kv}`;
  }
  function localSearch(q: string) {
    const ql = q.toLowerCase();
    const mods = MODULE_TYPES.filter((m) => m.type.toLowerCase().includes(ql) || m.kind.toLowerCase().includes(ql));
    const models = Object.entries(MODEL_LIBRARY).filter(
      ([k, v]) => k.toLowerCase().includes(ql) || v.title.toLowerCase().includes(ql) || v.desc.toLowerCase().includes(ql)
    );
    const parts: string[] = [];
    if (mods.length) {
      parts.push(`模块匹配 (${mods.length})\n` + mods.slice(0, 8).map(summarizeModule).join("\n"));
    }
    if (models.length) {
      parts.push(`模型匹配 (${models.length})`);
      parts.push(models.slice(0, 5).map(([k, v]) => `• ${v.title} — ${v.desc}`).join("\n"));
      const cites = models
        .slice(0, 5)
        .map(([k, v]) => (v.primary?.url ? `- ${v.primary.name}: ${v.primary.url}` : ""))
        .filter(Boolean);
      if (cites.length) parts.push("参考：\n" + cites.join("\n"));
    }
    if (!parts.length)
      parts.push('未找到匹配项，尝试换个关键词，比如模块类型（如 "TransformerDecoder"）、场景（如 "对比学习"）或任务（如 "文生图"）。');
    return parts.join("\n\n");
  }

  async function onSend(){
    const q = input.trim(); if(!q) return;
    setInput(''); setBusy(true);

    // 先把用户消息显示出来 + 占位一条 assistant
    setMessages(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }]);
    const assistantIndex = messages.length + 1;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: q }].map(m => ({ role: m.role, content: m.content })),
          context: { modelMeta, nodes, edges, selectedNodeType },
        }),
      });
      if (!res.ok || !res.body) throw new Error('network');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.type === 'response.output_text.delta') {
              setMessages(prev => {
                const copy = [...prev];
                copy[assistantIndex] = {
                  role: 'assistant',
                  content: (copy[assistantIndex]?.content || '') + evt.delta,
                };
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch {
      // 兜底：站内检索
      const ans = localSearch(q);
      setMessages(prev => [...prev, { role: 'assistant', content: ans }]);
    } finally { setBusy(false); }
  }


  function toModel() {
    const last = messages[messages.length - 1];
    if (!last || last.role === "user") return;
    onInsertModel(last.content);
  }
  function toModule() {
    const last = messages[messages.length - 1];
    if (!last || last.role === "user") return;
    onInsertModule(last.content);
  }

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="w-4 h-4" />
          <div className="font-medium">AI Chat</div>
          <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Beta
          </span>
        </div>
        <div className="border rounded-md p-2 h-[300px] overflow-auto bg-slate-50/60">
          {messages.map((m, i) => (
            <div key={i} className={`text-sm whitespace-pre-wrap ${m.role === "user" ? "text-slate-900" : "text-slate-700"}`} style={{ marginBottom: 8 }}>
              {m.role === "user" ? "你：" : "助手："}
              {m.content}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Input
            placeholder="搜索模块/模型，或直接提问…（示例： TransformerDecoder 论文）"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSend();
            }}
          />
          <Button onClick={onSend} disabled={busy} className="gap-1">
            <Send className="w-4 h-4" />
            发送
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={toModel} className="gap-1">
                <StickyNote className="w-3 h-3" />
                写入模型备注
              </Button>
            </TooltipTrigger>
            <TooltipContent>把上条回复附加到“模型备注”</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button variant="outline" size="sm" onClick={toModule} disabled={!canInsertModule} className="gap-1">
                  <StickyNote className="w-3 h-3" />
                  写入当前模块
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{canInsertModule ? `把上条回复附加到 ${selectedNodeType || "选中模块"} 的说明` : "请先选择一个模块"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const last = messages[messages.length - 1];
                  if (!last || last.role === "user") return;
                  navigator.clipboard?.writeText(last.content);
                }}
                className="gap-1"
              >
                <Copy className="w-3 h-3" />
                复制
              </Button>
            </TooltipTrigger>
            <TooltipContent>复制上条回复文本</TooltipContent>
          </Tooltip>
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          提示：当前为站内检索实现；若你提供后端接口 <code>/api/chat</code>，可将此面板升级为真正的 LLM 对话。
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Page =====
export default function Page() {
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
  const [rightTab, setRightTab] = useState("model");
  const [modelMeta, setModelMeta] = useState<{ name: string; notes: string }>({ name: "My Design", notes: "" });
  // 在 Page() 函数内部添加这些状态
  const [zoom, setZoom] = useState(1); // 缩放比例：0.5 - 2.0
  const [pan, setPan] = useState({ x: 0, y: 0 }); // 平移偏移
  const [isPanning, setIsPanning] = useState(false); // 是否正在平移
  const [panStart, setPanStart] = useState({ x: 0, y: 0 }); // 平移起点
  // const [spacePressed, setSpacePressed] = useState(false); // 空格键是否按下

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
      useSensor(TouchSensor, {
        activationConstraint: {
          delay: 120,   // 长按触发时间（毫秒）
          tolerance: 5, // 长按期间允许的手指位移像素
        },
      })  );

  // Page 组件内部：
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

  // const handleWheel = (e: React.WheelEvent) => {
  //   if (e.ctrlKey || e.metaKey) {
  //     e.preventDefault();
  //     const delta = e.deltaY > 0 ? -0.1 : 0.1;
  //     handleZoom(delta, e.clientX, e.clientY);
  //   }
  // };
  // 滚轮缩放（不需要 Ctrl）
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    handleZoom(delta, e.clientX, e.clientY);
  };

  // const handlePanStart = (e: React.MouseEvent) => {
  //   if (spacePressed || e.button === 1) {
  //     e.preventDefault();
  //     setIsPanning(true);
  //     setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  //   }
  // };

  // 平移开始（点击空白处时）
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // 如果点击的是画布空白处（不是节点），就开始平移
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('#canvas-content')) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
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

  // 在 Page 组件的 useEffect 中添加键盘控制
  // useEffect(() => {
  //   const handleKeyDown = (e: KeyboardEvent) => {
  //     if (e.code === "Space" && !e.repeat) {
  //       e.preventDefault();
  //       setSpacePressed(true);
  //     }
  //   };
  //   const handleKeyUp = (e: KeyboardEvent) => {
  //     if (e.code === "Space") {
  //       setSpacePressed(false);
  //       setIsPanning(false);
  //     }
  //   };
  //
  //   window.addEventListener("keydown", handleKeyDown);
  //   window.addEventListener("keyup", handleKeyUp);
  //
  //   return () => {
  //     window.removeEventListener("keydown", handleKeyDown);
  //     window.removeEventListener("keyup", handleKeyUp);
  //   };
  // }, []);

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
      console.assert(typeof ChatPanel === "function", "ChatPanel should be defined");
      // presence of canvas root
      console.assert(!!document.getElementById("canvas-root"), "canvas-root should exist");
      // eslint-disable-next-line no-console
      console.debug("[SelfTests] PASS");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[SelfTests] FAIL", err);
    }
  }, [nodes, edges]);

  function loadTemplate(key: keyof typeof TEMPLATES | string) {
    const { nodes, edges } = TEMPLATES[key as string]();
    const laid = nodes.map((node: any, i: number) => ({
      ...node,
      x: 120 + i * 180,
      y: 160 + (i % 2) * 120,
    }));
    setNodes(laid);
    setEdges(edges as any);
    setSel(null);
    setTpl(key as string);
  }

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

  function onDragStart(e: any) {
    setActiveDrag(e.active);
    setDragFromPalette(!!e.active?.data?.current?.fromPalette);
  }
  function onDragMove(e: any) {
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
  function onDragEnd(e: any) {
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

  function addEdge(a: string | null, b: string | null) {
    if (!a || !b || a === b) return;
    const i = nodes.findIndex((n) => n.id === a),
      j = nodes.findIndex((n) => n.id === b);
    if (i < 0 || j < 0) return;
    if (edges.some(([f, t]) => f === i && t === j)) return;
    setEdges((e) => [...e, [i, j]]);
  }
  function removeNode(id: string) {
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx < 0) return;
    setNodes((p) => p.filter((n) => n.id !== id));
    setEdges((p) => p.filter(([f, t]) => f !== idx && t !== idx).map(([f, t]) => [f - (f > idx ? 1 : 0), t - (t > idx ? 1 : 0)]));
    if (sel === id) setSel(null);
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

  const ex = useMemo(() => explain(nodes, edges), [nodes, edges]);
  const filtered = MODULE_TYPES.filter(
    (m) => m.type.toLowerCase().includes(filter.toLowerCase()) || m.kind.toLowerCase().includes(filter.toLowerCase())
  );
  const selectedNode = useMemo(() => nodes.find((n) => n.id === sel) || null, [nodes, sel]);

  const [overlayAllowed, setOverlayAllowed] = useState(true);
  useEffect(() => {
    setOverlayAllowed(dragFromPalette);
  }, [dragFromPalette]);

  const renderOverlay = () => {
    // 仅在从左侧“模块库”拖拽时显示 Overlay，避免画布节点出现“影子”重复
    if (!activeDrag || !overlayAllowed) return null;
    const item = activeDrag.data?.current?.item;
    if (!item) return null;
    const color = MODULE_TYPES.find((m) => m.type === item.type)?.color;
    return (
      <div className={`w-[200px] ${color} border rounded-xl shadow-sm`}>
        <div className="h-[32px] px-3 flex items-center font-medium text-sm">{item.type}</div>
        <div className="p-3 text-xs text-slate-600">从面板拖拽</div>
      </div>
    );
  };

  const insertToModelNotes = (t: string) => setModelMeta((v) => ({ ...v, notes: v.notes ? v.notes + "\n" + t : t }));
  const insertToModuleNotes = (t: string) => {
    if (!sel) return;
    setNodes((prev) => prev.map((n) => (n.id === sel ? { ...n, notes: n.notes ? n.notes + "\n" + t : t } : n)));
  };

  return (
    <TooltipProvider>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => setGuides({ x: null, y: null })}
      >
        <div className="w-full min-h-[100dvh] grid grid-cols-[320px_1fr_380px] gap-4 p-4 bg-slate-50">
          {/* Left */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              <div className="font-semibold">模块库</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-full">
                <Search className="absolute left-2 top-2.5 w-4 h-4 text-slate-400" />
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
            <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-auto pr-1">
              {filtered.map((it) => (
                <PaletteItem key={it.type} item={it} />
              ))}
            </div>

            {/* 模型库 + 论文链接美化 */}
            <div className="pt-2 space-y-2 max-h-[320px] overflow-auto pr-1">
              {Object.entries(MODEL_LIBRARY).map(([k, v]) => (
                <div key={k} className="rounded-xl border bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{v.title}</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => loadTemplate(k)}>
                        加载
                      </Button>
                      {v.primary && (
                        <a
                          href={v.primary.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] px-2 py-0.5 rounded-full border bg-white hover:bg-slate-50 inline-flex items-center gap-1"
                        >
                          <FileText className="w-3 h-3" />
                          论文
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">{v.desc}</div>
                  {MODEL_LINKS[k] && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {MODEL_LINKS[k].github && (
                        <a
                          className="text-[11px] px-2 py-0.5 rounded-full border bg-slate-50 hover:bg-slate-100"
                          href={MODEL_LINKS[k].github}
                          target="_blank"
                          rel="noreferrer"
                        >
                          GitHub
                        </a>
                      )}
                      {MODEL_LINKS[k].hf && (
                        <a
                          className="text-[11px] px-2 py-0.5 rounded-full border bg-slate-50 hover:bg-slate-100"
                          href={MODEL_LINKS[k].hf}
                          target="_blank"
                          rel="noreferrer"
                        >
                          HuggingFace
                        </a>
                      )}
                    </div>
                  )}
                  {v.variants?.length ? (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {v.variants.slice(0, 3).map((vv, i) => (
                        <a
                          key={i}
                          className="text-[11px] px-2 py-0.5 rounded-full border bg-white hover:bg-slate-50 inline-flex items-center gap-1"
                          href={vv.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {vv.name}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

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

          {/* Center */}
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5"/>
                <div className="font-semibold">拼装画布</div>
                <div className="text-xs text-slate-500 ml-2">拖拽模块；连线模式：先点“源”，再可连续点多个“目标”；按 Esc
                  取消当前源
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
                    linkMode ? "cursor-crosshair" : isPanning ? "cursor-grab" : ""
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
                    width: "3000px",
                    height: "2000px",
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
                  return <path key={i} d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} stroke="#94a3b8"
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
              <div className="absolute bottom-4 right-4 flex flex-col gap-2 bg-white rounded-lg shadow-md p-2 border z-10">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleZoom(0.1)}
                        disabled={zoom >= 2}
                        className="h-8 w-8"
                    >
                      <Plus className="w-4 h-4" />
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
                      <Minus className="w-4 h-4" />
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
                      <Maximize2 className="w-4 h-4" />
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
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>重置视图</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* Right */}
          <div className="space-y-3">
            <Tabs value={rightTab} onValueChange={setRightTab}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="model">模型</TabsTrigger>
                <TabsTrigger value="module">模块</TabsTrigger>
                <TabsTrigger value="chat">AI</TabsTrigger>
              </TabsList>

              {/* 模型 Tab */}
              <div className={rightTab === "model" ? "" : "hidden"}>
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="text-xs text-slate-500">模型说明</div>
                    <div className="font-semibold">{ex.headline}</div>
                    <div className="text-xs text-slate-600">{ex.summary}</div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {ex.traits.map((t, i) => (
                        <Badge key={i} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-sm pt-2">
                      <div className="font-medium">可能的应用：</div>
                      <ul className="list-disc pl-5 text-slate-700">
                        {ex.apps.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>

                <Card className="mt-3">
                  <CardContent className="p-4 space-y-3">
                    <div className="text-xs text-slate-500">模型属性</div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 text-xs text-slate-500">名称</div>
                      <Input value={modelMeta.name} onChange={(e) => setModelMeta((v) => ({ ...v, name: e.target.value }))} />
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-24 text-xs text-slate-500">备注</div>
                      <textarea
                        value={modelMeta.notes}
                        onChange={(e) => setModelMeta((v) => ({ ...v, notes: e.target.value }))}
                        className="flex-1 min-h-[88px] rounded-md border px-3 py-2 text-sm"
                        placeholder="关于此模型的说明、约束、训练/推理注意点等"
                      />
                    </div>
                    <div className="text-[11px] text-slate-500">导出时会附带这些元信息。</div>
                  </CardContent>
                </Card>

                {/* 开发模式测试 */}
                {process.env.NODE_ENV !== "production" && (
                  <Card className="mt-3">
                    <CardContent className="p-4 space-y-2">
                      <div className="text-xs text-slate-500">Dev Tests</div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (nodes[0]) setSel(nodes[0].id);
                          }}
                        >
                          选中第一个节点
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setSel(null)}>
                          清除选中
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const bad = [...edges, [0, 0]];
                            console.log("Inject bad edge (self-loop) for validator demo", bad);
                          }}
                        >
                          注入自环测试
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* 模块 Tab */}
              <div className={rightTab === "module" ? "" : "hidden"}>
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="text-xs text-slate-500">模块说明</div>
                    {sel ? (
                      <div className="mt-2 space-y-2">
                        <div className="text-[11px] text-slate-500">为当前选中模块添加说明：</div>
                        <textarea
                          value={selectedNode?.notes ?? ""}
                          onChange={(e) =>
                            setNodes((prev) => prev.map((n) => (n.id === sel ? { ...n, notes: e.target.value } : n)))
                          }
                          className="w-full min-h-[100px] rounded-md border px-3 py-2 text-sm"
                          placeholder="为该模块写点说明…（用途、输入/输出、依赖、注意事项、超参策略等）"
                        />
                        <div className="text-[11px] text-slate-500">说明会随导出一起保存到对应模块。</div>
                      </div>
                    ) : null}
                    {sel ? (
                      <>
                        <div className="font-medium text-sm">{nodes.find((n) => n.id === sel)?.type}</div>
                        <div className="text-xs text-slate-600">在下方编辑该模块参数。</div>
                      </>
                    ) : (
                      <div className="text-slate-500 text-sm">未选择模块</div>
                    )}
                  </CardContent>
                </Card>
                <Card className="mt-3">
                  <CardContent className="p-4 space-y-3">
                    <div className="text-xs text-slate-500">模块属性</div>
                    {sel ? (
                      <ModuleForm
                        node={nodes.find((n) => n.id === sel)}
                        onChange={(patch: any) =>
                          setNodes((prev) =>
                            prev.map((n) => (n.id === sel ? { ...n, props: { ...n.props, ...patch } } : n))
                          )
                        }
                      />
                    ) : (
                      <div className="text-slate-500 text-sm">选择画布上的模块以编辑参数</div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* AI Chat Tab */}
              <div className={rightTab === "chat" ? "" : "hidden"}>
                <ChatPanel
                    canInsertModule={!!sel}
                    onInsertModel={insertToModelNotes}
                    onInsertModule={insertToModuleNotes}
                    selectedNodeType={selectedNode?.type || null}
                    modelMeta={modelMeta}
                    nodes={nodes}
                    edges={edges}
                    conversationId={convId}
                />
              </div>
            </Tabs>
          </div>
        </div>

        <DragOverlay dropAnimation={null}>{renderOverlay()}</DragOverlay>
      </DndContext>
    </TooltipProvider>
  );
}
