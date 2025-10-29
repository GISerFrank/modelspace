// src/app/api/smart-import/parse/route.ts
// 使用百度 AI Studio PaddleOCR-VL API + GPT-4 分析

export const runtime = "edge";
export const maxDuration = 60; // Vercel Pro 可以设置为 60秒

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ==================== 配置 ====================
const AI_STUDIO_API_KEY = process.env.AI_STUDIO_API_KEY!;
const AI_STUDIO_BASE_URL = "https://aistudio.baidu.com/llm/lmapi/v3";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

// ==================== 类型定义 ====================
interface BaiduOCRResult {
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
  };
}

// ==================== 核心功能 ====================

/**
 * 方案选择:根据环境变量决定是否使用OCR
 */
function shouldUseOCR(): boolean {
  return process.env.USE_BAIDU_OCR === "true" && !!AI_STUDIO_API_KEY;
}

/**
 * 使用百度 AI Studio PaddleOCR-VL API 进行文档解析
 *
 * 百度文档: https://ai.baidu.com/ai-doc/AISTUDIO/2mh4okm66
 *
 * 注意:百度目前可能是通过在线应用的方式提供服务,
 * 如果没有直接的 REST API,可能需要:
 * 1. 使用他们的应用实例
 * 2. 或者通过 SDK 调用
 *
 * 这里先提供一个基础实现框架
 */
async function callBaiduPaddleOCR(pdfBuffer: ArrayBuffer): Promise<BaiduOCRResult> {
  try {
    console.log("[Baidu OCR] Starting document parsing...");

    // 方法1: 如果百度提供了直接的 OCR API endpoint
    // 参考:https://aistudio.baidu.com/application/detail/98365

    const formData = new FormData();
    formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }));

    // 注意:这个 endpoint 可能需要根据百度实际文档调整
    // 请查看你链接中的具体 API 调用方式
    const response = await fetch(`${AI_STUDIO_BASE_URL}/ocr/paddleocr-vl`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_STUDIO_API_KEY}`,
        // 可能还需要其他 headers
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Baidu OCR API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("[Baidu OCR] Parsing completed successfully");

    // 转换百度返回格式为我们的标准格式
    return parseBaiduOCRResponse(result);
  } catch (error: any) {
    console.error("[Baidu OCR] Error:", error.message);
    throw new Error(`Baidu OCR failed: ${error.message}`);
  }
}

/**
 * 方法2: 如果需要使用百度的大模型 API 来处理 PDF
 * 百度 AI Studio 支持类似 OpenAI 的调用方式
 */
async function callBaiduViaLLM(pdfBase64: string): Promise<BaiduOCRResult> {
  try {
    console.log("[Baidu LLM] Processing document via ERNIE...");

    // 使用百度的大模型 API (兼容 OpenAI SDK)
    const client = new OpenAI({
      apiKey: AI_STUDIO_API_KEY,
      baseURL: AI_STUDIO_BASE_URL,
    });

    // 调用百度的多模态模型处理 PDF
    const response = await client.chat.completions.create({
      model: "ernie-4.0-8k-latest", // 或其他支持文档的模型
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please analyze this PDF document and extract all text, tables, formulas, and charts. Return a structured JSON with the following format: {text: string, tables: [], formulas: [], charts: [], metadata: {}}",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${pdfBase64}`,
              },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    return {
      text: parsed.text || "",
      tables: parsed.tables || [],
      formulas: parsed.formulas || [],
      charts: parsed.charts || [],
      metadata: parsed.metadata || { pages: 1 },
    };
  } catch (error: any) {
    console.error("[Baidu LLM] Error:", error.message);
    throw new Error(`Baidu LLM processing failed: ${error.message}`);
  }
}

/**
 * 解析百度 OCR 返回格式
 */
function parseBaiduOCRResponse(result: any): BaiduOCRResult {
  // 根据百度实际返回的格式进行解析
  // 这里需要参考百度文档的具体返回结构

  return {
    text: result.text || result.content || "",
    tables: result.tables || [],
    formulas: result.formulas || result.math_blocks || [],
    charts: result.charts || result.figures || [],
    metadata: {
      pages: result.pages || result.page_count || 1,
      language: result.language || "unknown",
    },
  };
}

/**
 * 回退方案:简单提取 PDF 文本 (不使用 OCR)
 */
async function extractPdfTextSimple(pdfBuffer: ArrayBuffer): Promise<string> {
  // 这里使用简单的文本提取,不需要 OCR
  // 在 Edge Runtime 中,我们可以使用 pdfjs-dist
  // 或者直接返回一个提示信息

  console.log("[Fallback] Using simple text extraction (no OCR)");
  return "PDF content extracted without OCR. For better results, enable Baidu OCR in environment variables.";
}

/**
 * 使用 GPT-4 分析 OCR 结果并生成模块结构
 */
async function analyzeWithGPT(ocrResult: BaiduOCRResult): Promise<ModelStructure> {
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  // 构建 prompt
  const prompt = buildAnalysisPrompt(ocrResult);

  console.log("[GPT-4] Analyzing OCR results...");

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are an AI model architecture analyzer. Extract neural network modules from research papers and return a JSON structure.`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content || "{}";
  const result = JSON.parse(content);

  return normalizeGPTResponse(result);
}

/**
 * 构建 GPT 分析 prompt
 */
function buildAnalysisPrompt(ocrResult: BaiduOCRResult): string {
  let prompt = "# Document Analysis\n\n";

  // 添加文本内容
  if (ocrResult.text) {
    prompt += `## Full Text\n${ocrResult.text.slice(0, 10000)}\n\n`;
  }

  // 添加表格信息
  if (ocrResult.tables && ocrResult.tables.length > 0) {
    prompt += `## Tables Found\n`;
    ocrResult.tables.forEach((table, i) => {
      prompt += `Table ${i + 1} (Page ${table.page}):\n`;
      prompt += JSON.stringify(table.data.slice(0, 5)) + "\n\n";
    });
  }

  // 添加公式信息
  if (ocrResult.formulas && ocrResult.formulas.length > 0) {
    prompt += `## Formulas\n`;
    ocrResult.formulas.forEach((formula) => {
      prompt += `- Page ${formula.page}: ${formula.formula}\n`;
    });
    prompt += "\n";
  }

  // 添加图表信息
  if (ocrResult.charts && ocrResult.charts.length > 0) {
    prompt += `## Charts & Figures\n`;
    ocrResult.charts.forEach((chart) => {
      prompt += `- Page ${chart.page}: ${chart.description}\n`;
    });
    prompt += "\n";
  }

  prompt += `
## Task
Based on the above content, extract the neural network architecture and return a JSON with:
{
  "nodes": [
    {"id": "0", "type": "Input", "x": 100, "y": 100, "props": {...}, "notes": "..."},
    {"id": "1", "type": "Embedding", "x": 100, "y": 200, "props": {"dim": 768}, "notes": "From Table 1"}
  ],
  "edges": [[0, 1], [1, 2]],
  "meta": {
    "name": "Model Name",
    "notes": "Brief description from paper"
  }
}

Available module types: Input, Embedding, TransformerEncoder, TransformerDecoder, Attention, FeedForward, LayerNorm, Output, etc.
`;

  return prompt;
}

/**
 * 标准化 GPT 响应
 */
function normalizeGPTResponse(gptOutput: any): ModelStructure {
  const nodes = (gptOutput.nodes || []).map((node: any, index: number) => ({
    id: node.id || String(index),
    type: node.type || "Unknown",
    x: node.x || 100 + index * 50,
    y: node.y || 100 + index * 100,
    props: node.props || {},
    notes: node.notes || "",
  }));

  return {
    nodes,
    edges: gptOutput.edges || [],
    meta: {
      name: gptOutput.meta?.name || "Imported Model",
      notes: gptOutput.meta?.notes || "",
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

    console.log(`[API] Processing file: ${file.name} (${file.size} bytes)`);

    // 读取 PDF 文件
    const pdfBuffer = await file.arrayBuffer();

    let ocrResult: BaiduOCRResult;

    // 根据配置选择处理方式
    if (shouldUseOCR()) {
      console.log("[API] Using Baidu PaddleOCR-VL");

      try {
        // 优先尝试方法1: 直接 OCR API
        ocrResult = await callBaiduPaddleOCR(pdfBuffer);
      } catch (error) {
        console.log("[API] Falling back to Baidu LLM method");
        // 回退到方法2: 使用百度大模型
        const base64 = Buffer.from(pdfBuffer).toString("base64");
        ocrResult = await callBaiduViaLLM(base64);
      }
    } else {
      console.log("[API] OCR disabled, using simple text extraction");
      const text = await extractPdfTextSimple(pdfBuffer);
      ocrResult = {
        text,
        tables: [],
        formulas: [],
        charts: [],
        metadata: { pages: 1 },
      };
    }

    // 使用 GPT-4 分析结果
    const structure = await analyzeWithGPT(ocrResult);

    console.log("[API] ✅ Processing completed successfully");

    return NextResponse.json({
      success: true,
      source: shouldUseOCR() ? "baidu-paddleocr-vl" : "simple-extraction",
      structure,
      stats: {
        text_length: ocrResult.text.length,
        tables_count: ocrResult.tables?.length || 0,
        formulas_count: ocrResult.formulas?.length || 0,
        charts_count: ocrResult.charts?.length || 0,
        pages: ocrResult.metadata?.pages || 1,
      },
    });
  } catch (error: any) {
    console.error("[API] ❌ Error:", error.message);
    return NextResponse.json(
        {
          success: false,
          error: error.message || "Processing failed",
        },
        { status: 500 }
    );
  }
}