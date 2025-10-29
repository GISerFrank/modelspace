// src/app/api/smart-import/parse/route.ts
export const runtime = "edge";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ==================== 配置 ====================
const AI_STUDIO_API_KEY = process.env.AI_STUDIO_API_KEY!;
const AI_STUDIO_BASE_URL = "https://aistudio.baidu.com/llm/lmapi/v3";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // 可选,用于提高API限额

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

interface GitHubContent {
  code: string;
  readme?: string;
  repoName: string;
  filePath?: string;
}

// ==================== GitHub 解析功能 ====================

/**
 * 解析 GitHub URL,提取 owner, repo, path
 */
function parseGitHubUrl(url: string): { owner: string; repo: string; path?: string } | null {
  try {
    const patterns = [
      // https://github.com/owner/repo
      /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/?$/,
      // https://github.com/owner/repo/blob/branch/path/to/file.py
      /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/[^\/]+\/(.+)$/,
      // https://github.com/owner/repo/tree/branch/path/to/dir
      /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/[^\/]+\/(.+)$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace(/\.git$/, ""),
          path: match[3],
        };
      }
    }

    return null;
  } catch (error) {
    console.error("[GitHub URL Parse] Error:", error);
    return null;
  }
}

/**
 * 从 GitHub 获取内容
 */
async function fetchGitHubContent(url: string): Promise<GitHubContent> {
  const parsed = parseGitHubUrl(url);
  
  if (!parsed) {
    throw new Error("无效的 GitHub URL 格式");
  }

  const { owner, repo, path } = parsed;
  const headers: HeadersInit = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "AI-Model-Puzzle-Import",
  };

  if (GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  }

  try {
    let code = "";
    let readme = "";

    // 如果指定了文件路径,直接获取该文件
    if (path) {
      console.log(`[GitHub] Fetching file: ${owner}/${repo}/${path}`);
      
      const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
      const fileRes = await fetch(fileUrl, { headers });
      
      if (!fileRes.ok) {
        throw new Error(`GitHub API 错误: ${fileRes.status} ${fileRes.statusText}`);
      }
      
      const fileData = await fileRes.json();
      
      if (fileData.type === "file" && fileData.content) {
        // GitHub API 返回 base64 编码的内容
        code = atob(fileData.content);
      } else if (fileData.type === "dir") {
        // 如果是目录,获取该目录下的所有 Python 文件
        code = await fetchDirectoryCode(owner, repo, path, headers);
      }
    } else {
      // 如果没有指定路径,搜索仓库中的模型文件
      console.log(`[GitHub] Searching for model files in: ${owner}/${repo}`);
      code = await searchModelFiles(owner, repo, headers);
    }

    // 获取 README
    try {
      const readmeUrl = `https://api.github.com/repos/${owner}/${repo}/readme`;
      const readmeRes = await fetch(readmeUrl, { headers });
      
      if (readmeRes.ok) {
        const readmeData = await readmeRes.json();
        readme = atob(readmeData.content);
      }
    } catch (e) {
      console.log("[GitHub] README not found or inaccessible");
    }

    return {
      code,
      readme,
      repoName: `${owner}/${repo}`,
      filePath: path,
    };
  } catch (error: any) {
    console.error("[GitHub] Fetch error:", error);
    throw new Error(`GitHub 获取失败: ${error.message}`);
  }
}

/**
 * 获取目录下的代码文件
 */
async function fetchDirectoryCode(
  owner: string,
  repo: string,
  path: string,
  headers: HeadersInit
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(url, { headers });
  
  if (!res.ok) {
    throw new Error(`无法获取目录内容: ${res.statusText}`);
  }
  
  const files = await res.json();
  const codeFiles = files.filter((f: any) => 
    f.type === "file" && (f.name.endsWith(".py") || f.name.endsWith(".js") || f.name.endsWith(".ts"))
  );

  // 限制最多获取 5 个文件
  const codes = await Promise.all(
    codeFiles.slice(0, 5).map(async (file: any) => {
      const fileRes = await fetch(file.url, { headers });
      const fileData = await fileRes.json();
      return `// ${file.name}\n${atob(fileData.content)}`;
    })
  );

  return codes.join("\n\n");
}

/**
 * 搜索仓库中的模型文件
 */
async function searchModelFiles(
  owner: string,
  repo: string,
  headers: HeadersInit
): Promise<string> {
  // 尝试获取常见的模型文件位置
  const commonPaths = [
    "model.py",
    "models.py",
    "network.py",
    "architecture.py",
    "src/model.py",
    "src/models.py",
    "models/model.py",
  ];

  for (const path of commonPaths) {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
      const res = await fetch(url, { headers });
      
      if (res.ok) {
        const data = await res.json();
        if (data.type === "file" && data.content) {
          console.log(`[GitHub] Found model file: ${path}`);
          return atob(data.content);
        }
      }
    } catch (e) {
      // 继续尝试下一个路径
    }
  }

  // 如果找不到特定文件,获取仓库根目录的 Python 文件
  const rootUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
  const rootRes = await fetch(rootUrl, { headers });
  
  if (rootRes.ok) {
    const files = await rootRes.json();
    const pyFiles = files.filter((f: any) => 
      f.type === "file" && f.name.endsWith(".py")
    );

    if (pyFiles.length > 0) {
      // 获取第一个 Python 文件
      const firstFile = pyFiles[0];
      const fileRes = await fetch(firstFile.url, { headers });
      const fileData = await fileRes.json();
      return atob(fileData.content);
    }
  }

  throw new Error("未找到模型代码文件");
}

/**
 * 使用 GPT 分析 GitHub 代码
 */
async function analyzeGitHubCode(content: GitHubContent): Promise<ModelStructure> {
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const prompt = `
You are an AI model architecture analyzer. Analyze the following code and README to extract the model structure.

Repository: ${content.repoName}
${content.filePath ? `File: ${content.filePath}` : ""}

README:
${content.readme ? content.readme.slice(0, 2000) : "No README available"}

CODE:
${content.code.slice(0, 8000)}

Extract:
1. All model modules/layers (e.g., Embedding, Transformer, Linear, Conv2d, etc.)
2. Connections between modules (data flow)
3. Key parameters (hidden_dim, num_layers, etc.)

Return a JSON structure:
{
  "nodes": [
    {"type": "ModuleName", "props": {"param1": value}, "notes": "description"}
  ],
  "edges": [[from_index, to_index]],
  "meta": {
    "name": "Model Name",
    "notes": "Brief description from README"
  }
}

Focus on the main model architecture. Ignore training/data loading code.
`;

  console.log("[GPT-4] Analyzing GitHub code...");

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are an AI model architecture analyzer. Return only valid JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content_text = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content_text);

  return normalizeGPTResponse(parsed);
}

// ==================== PDF 处理功能(保持原有代码) ====================

function shouldUseOCR(): boolean {
  return process.env.USE_BAIDU_OCR === "true" && !!AI_STUDIO_API_KEY;
}

async function callBaiduPaddleOCR(pdfBuffer: ArrayBuffer): Promise<BaiduOCRResult> {
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
    throw new Error(`Baidu OCR API error: ${response.status}`);
  }

  const result = await response.json();
  return parseBaiduOCRResponse(result);
}

async function callBaiduViaLLM(pdfBase64: string): Promise<BaiduOCRResult> {
  const client = new OpenAI({
    apiKey: AI_STUDIO_API_KEY,
    baseURL: AI_STUDIO_BASE_URL,
  });

  const response = await client.chat.completions.create({
    model: "ernie-4.0-8k-latest",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract text, tables, formulas from this PDF. Return JSON: {text, tables, formulas, charts, metadata}",
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
  return JSON.parse(content);
}

function parseBaiduOCRResponse(result: any): BaiduOCRResult {
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

async function extractPdfTextSimple(pdfBuffer: ArrayBuffer): Promise<string> {
  return "PDF content (OCR disabled). Enable USE_BAIDU_OCR for better results.";
}

async function analyzeWithGPT(ocrResult: BaiduOCRResult): Promise<ModelStructure> {
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const prompt = buildAnalysisPrompt(ocrResult);

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are an AI model architecture analyzer. Return only valid JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);

  return normalizeGPTResponse(parsed);
}

function buildAnalysisPrompt(ocrResult: BaiduOCRResult): string {
  const prompt = `
Analyze this research paper and extract the AI model architecture.

Text Content:
${ocrResult.text.slice(0, 10000)}

${ocrResult.tables && ocrResult.tables.length > 0 ? `Tables: ${JSON.stringify(ocrResult.tables.slice(0, 3))}` : ""}
${ocrResult.formulas && ocrResult.formulas.length > 0 ? `Formulas: ${JSON.stringify(ocrResult.formulas.slice(0, 5))}` : ""}

Return JSON:
{
  "nodes": [{"type": "ModuleName", "props": {}, "notes": ""}],
  "edges": [[from, to]],
  "meta": {"name": "Model Name", "notes": "Description"}
}
`;

  return prompt;
}

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
    const contentType = req.headers.get("content-type") || "";

    // 处理 GitHub URL (JSON)
    if (contentType.includes("application/json")) {
      const body = await req.json();
      
      if (body.type === "github" && body.url) {
        console.log(`[API] Processing GitHub URL: ${body.url}`);
        
        const content = await fetchGitHubContent(body.url);
        const structure = await analyzeGitHubCode(content);

        return NextResponse.json({
          success: true,
          source: "github",
          ...structure,
        });
      } else {
        return NextResponse.json(
          { error: "Invalid request body" },
          { status: 400 }
        );
      }
    }

    // 处理 PDF 文件 (FormData)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("pdf") as File;

      if (!file) {
        return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
      }

      console.log(`[API] Processing PDF: ${file.name} (${file.size} bytes)`);

      const pdfBuffer = await file.arrayBuffer();
      let ocrResult: BaiduOCRResult;

      if (shouldUseOCR()) {
        console.log("[API] Using Baidu PaddleOCR-VL");
        try {
          ocrResult = await callBaiduPaddleOCR(pdfBuffer);
        } catch (error) {
          const base64 = Buffer.from(pdfBuffer).toString("base64");
          ocrResult = await callBaiduViaLLM(base64);
        }
      } else {
        const text = await extractPdfTextSimple(pdfBuffer);
        ocrResult = {
          text,
          tables: [],
          formulas: [],
          charts: [],
          metadata: { pages: 1 },
        };
      }

      const structure = await analyzeWithGPT(ocrResult);

      return NextResponse.json({
        success: true,
        source: shouldUseOCR() ? "baidu-paddleocr-vl" : "simple-extraction",
        ...structure,
        stats: {
          text_length: ocrResult.text.length,
          tables_count: ocrResult.tables?.length || 0,
          formulas_count: ocrResult.formulas?.length || 0,
          charts_count: ocrResult.charts?.length || 0,
          pages: ocrResult.metadata?.pages || 1,
        },
      });
    }

    return NextResponse.json(
      { error: "Unsupported content type" },
      { status: 400 }
    );
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
