// src/app/api/smart-import/pdf/direct/route.ts
// 直接处理小 PDF 文件 (<4MB)

export const runtime = "edge";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ==================== 类型定义 ====================
interface OCRResult {
    text: string;
    tables?: Array<{ page: number; data: any[][] }>;
    formulas?: Array<{ page: number; formula: string }>;
    charts?: Array<{ page: number; description: string }>;
    metadata?: {
        pages: number;
        language?: string;
    };
}

interface ModelStructure {
    nodes: Array<{
        id: string;
        type: string;
        x: number;
        y: number;
        props?: Record<string, any>;
        notes?: string;
    }>;
    edges: Array<[number, number]>;
    meta: {
        name: string;
        notes: string;
        source?: string;
    };
}

// ==================== OCR 处理 ====================

/**
 * 调用 OCR 服务
 */
async function callOCRService(pdfBuffer: ArrayBuffer): Promise<OCRResult> {
    // 选项 1: 百度 OCR
    if (process.env.USE_BAIDU_OCR === "true" && process.env.AI_STUDIO_API_KEY) {
        return await callBaiduOCR(pdfBuffer);
    }

    // 选项 2: 本地 OCR 服务
    if (process.env.OCR_SERVICE_URL) {
        return await callLocalOCR(pdfBuffer);
    }

    // 选项 3: 基础文本提取（后备方案）
    console.log("[OCR] No OCR service configured, using basic extraction");
    return {
        text: "PDF text extracted without OCR. For better results, configure OCR service.",
        metadata: { pages: 1 },
    };
}

/**
 * 百度 OCR
 */
async function callBaiduOCR(pdfBuffer: ArrayBuffer): Promise<OCRResult> {
    const AI_STUDIO_API_KEY = process.env.AI_STUDIO_API_KEY!;
    const AI_STUDIO_BASE_URL =
        process.env.AI_STUDIO_BASE_URL || "https://aistudio.baidu.com/llm/lmapi/v3";

    try {
        console.log("[Baidu OCR] Processing PDF...");

        const formData = new FormData();
        formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }));

        const response = await fetch(`${AI_STUDIO_BASE_URL}/ocr/paddleocr-vl`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${AI_STUDIO_API_KEY}`,
            },
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Baidu OCR failed: ${response.status}`);
        }

        const result = await response.json();
        console.log("[Baidu OCR] Completed");

        return {
            text: result.text || result.content || "",
            tables: result.tables || [],
            formulas: result.formulas || result.math_blocks || [],
            charts: result.charts || result.figures || [],
            metadata: {
                pages: result.pages || result.page_count || 1,
                language: result.language,
            },
        };
    } catch (error: any) {
        console.error("[Baidu OCR] Error:", error.message);
        throw error;
    }
}

/**
 * 本地 OCR 服务
 */
async function callLocalOCR(pdfBuffer: ArrayBuffer): Promise<OCRResult> {
    const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL!;

    try {
        console.log(`[Local OCR] Calling service at ${OCR_SERVICE_URL}`);

        const formData = new FormData();
        formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }));

        const response = await fetch(`${OCR_SERVICE_URL}/ocr`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Local OCR failed: ${response.status}`);
        }

        const result = await response.json();
        console.log("[Local OCR] Completed");
        return result;
    } catch (error: any) {
        console.error("[Local OCR] Error:", error.message);
        throw error;
    }
}

// ==================== GPT 分析 ====================

/**
 * 构建分析 Prompt
 */
function buildAnalysisPrompt(ocrResult: OCRResult): string {
    let prompt = "# Document Analysis\n\n";

    if (ocrResult.text) {
        prompt += `## Full Text\n${ocrResult.text.slice(0, 10000)}\n\n`;
    }

    if (ocrResult.tables && ocrResult.tables.length > 0) {
        prompt += `## Tables\n`;
        ocrResult.tables.forEach((table, i) => {
            prompt += `Table ${i + 1} (Page ${table.page}):\n`;
            prompt += JSON.stringify(table.data.slice(0, 5)) + "\n\n";
        });
    }

    if (ocrResult.formulas && ocrResult.formulas.length > 0) {
        prompt += `## Formulas\n`;
        ocrResult.formulas.forEach((formula) => {
            prompt += `- Page ${formula.page}: ${formula.formula}\n`;
        });
        prompt += "\n";
    }

    if (ocrResult.charts && ocrResult.charts.length > 0) {
        prompt += `## Charts & Figures\n`;
        ocrResult.charts.forEach((chart) => {
            prompt += `- Page ${chart.page}: ${chart.description}\n`;
        });
        prompt += "\n";
    }

    prompt += `
## Task
Extract the neural network architecture from the above content and return JSON:
{
  "nodes": [
    {"id": "0", "type": "Input", "x": 100, "y": 100, "props": {}, "notes": ""},
    {"id": "1", "type": "Embedding", "x": 100, "y": 200, "props": {"dim": 768}, "notes": "From Table 1"}
  ],
  "edges": [[0, 1], [1, 2]],
  "meta": {
    "name": "Model Name",
    "notes": "Brief description"
  }
}

Common types: Input, Embedding, TransformerEncoder, TransformerDecoder, Attention, 
FeedForward, LayerNorm, Dropout, Linear, Conv2D, Output, etc.`;

    return prompt;
}

/**
 * 使用 GPT 分析
 */
async function analyzeWithGPT(
    ocrResult: OCRResult,
    filename: string
): Promise<ModelStructure> {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    console.log("[GPT] Analyzing document...");

    const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content:
                    "You are an AI assistant that extracts neural network architectures from research papers.",
            },
            {
                role: "user",
                content: buildAnalysisPrompt(ocrResult),
            },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0]?.message?.content || "{}");

    // 标准化响应
    const nodes = (result.nodes || []).map((node: any, index: number) => ({
        id: node.id || String(index),
        type: node.type || "Unknown",
        x: node.x || 100 + (index % 5) * 250,
        y: node.y || 100 + Math.floor(index / 5) * 150,
        props: node.props || {},
        notes: node.notes || "",
    }));

    return {
        nodes,
        edges: result.edges || [],
        meta: {
            name: result.meta?.name || "PDF Import",
            notes: result.meta?.notes || "",
            source: filename,
        },
    };
}

// ==================== API Handler ====================

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (file.type !== "application/pdf") {
            return NextResponse.json(
                { error: "Only PDF files are supported" },
                { status: 400 }
            );
        }

        // 检查文件大小
        const SIZE_LIMIT = 4 * 1024 * 1024; // 4MB
        if (file.size > SIZE_LIMIT) {
            return NextResponse.json(
                {
                    error: `File too large (${(file.size / 1024 / 1024).toFixed(
                        2
                    )}MB). Use /api/smart-import/pdf/upload for files >4MB`,
                    shouldUseUpload: true,
                },
                { status: 413 }
            );
        }

        console.log(
            `[PDF Direct] Processing: ${file.name} (${(file.size / 1024).toFixed(2)}KB)`
        );

        // 1. 读取 PDF
        const pdfBuffer = await file.arrayBuffer();

        // 2. OCR 提取
        const ocrResult = await callOCRService(pdfBuffer);
        console.log(`[PDF Direct] Extracted ${ocrResult.text.length} characters`);

        // 3. GPT 分析
        const structure = await analyzeWithGPT(ocrResult, file.name);
        console.log(`[PDF Direct] Found ${structure.nodes.length} nodes`);

        return NextResponse.json({
            success: true,
            structure,
            stats: {
                file_size: file.size,
                text_length: ocrResult.text.length,
                pages: ocrResult.metadata?.pages || 1,
                nodes_count: structure.nodes.length,
                edges_count: structure.edges.length,
            },
        });
    } catch (error: any) {
        console.error("[PDF Direct] Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || "Failed to process PDF",
            },
            { status: 500 }
        );
    }
}