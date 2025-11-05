// src/lib/constants.ts
export const MODULE_TYPES = [
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

export const MODEL_LIBRARY: Record<string, {
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

export const MODEL_LINKS: Record<string, { github?: string; hf?: string; ms?: string }> = {
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

export const TEMPLATES: Record<string, { nodes: any[]; edges: number[][] }> = {
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