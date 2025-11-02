// src/app/api/smart-import/pdf/process/route.ts
// 异步处理上传到 Blob 的 PDF 文件

export const runtime = "nodejs"; // 使用 Node.js runtime，支持更长执行时间
export const maxDuration = 300; // 5分钟（需要 Vercel Pro）

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { Redis } from "@upstash/redis";

// 初始化 Redis
const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
});

// ==================== 类型定义 ====================
interface OCRResult {
    text: string;
    tables?: Array<{ page: number; data: any[][] }>;
    formulas?: Array<{ page: number; formula: string }>;
    charts?: Array<{ page: number; description: string }>;
    metadata?: {
        pages: number;
        language?: string;
        images?: string[];
    };
}

interface ProcessingJob {
    jobId: string;
    status: "pending" | "processing" | "completed" | "error";
    progress: number;
    message: string;
    result?: any;
    error?: string;
    createdAt: number;
    updatedAt: number;
}

// ==================== OCR 服务 ====================

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

    // 选项 3: 使用 pdf-parse（后备方案）
    console.log("[OCR] Using pdf-parse for text extraction");
    return await extractWithPdfParse(pdfBuffer);
}

async function callBaiduOCR(pdfBuffer: ArrayBuffer): Promise<OCRResult> {
    const AI_STUDIO_API_KEY = process.env.AI_STUDIO_API_KEY;
    const AI_STUDIO_API_URL = process.env.AI_STUDIO_API_URL;

    if (!AI_STUDIO_API_KEY || !AI_STUDIO_API_URL) {
        throw new Error("Missing AI_STUDIO_API_KEY or AI_STUDIO_API_URL");
    }

    try {
        console.log("[Baidu OCR] Processing...");

        // 转换为 Base64
        const buffer = Buffer.from(pdfBuffer);
        const base64Data = buffer.toString('base64');

        // 使用正确的 API 格式
        const response = await fetch(AI_STUDIO_API_URL, {
            method: "POST",
            headers: {
                Authorization: `token ${AI_STUDIO_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                file: base64Data,
                fileType: 0, // 0 for PDF, 1 for images
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Baidu OCR] Error response:", errorText);
            throw new Error(`Baidu OCR failed: ${response.status}`);
        }

        const result = await response.json();

        // 提取 OCR 结果
        const ocrResults = result.result?.ocrResults || [];
        const text = ocrResults
            .map((r: any) => r.prunedResult || r.ocrResult || "")
            .join("\n\n");

        return {
            text,
            metadata: {
                pages: ocrResults.length,
                images: ocrResults.map((r: any) => r.ocrImage).filter(Boolean),
            },
        };
    } catch (error: any) {
        console.error("[Baidu OCR] Error:", error.message);
        throw error;
    }
}

async function callLocalOCR(pdfBuffer: ArrayBuffer): Promise<OCRResult> {
    const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL!;

    try {
        console.log(`[Local OCR] Calling ${OCR_SERVICE_URL}`);

        const formData = new FormData();
        formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }));

        const response = await fetch(`${OCR_SERVICE_URL}/ocr`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Local OCR failed: ${response.status}`);
        }

        return await response.json();
    } catch (error: any) {
        console.error("[Local OCR] Error:", error.message);
        throw error;
    }
}

async function extractWithPdfParse(pdfBuffer: ArrayBuffer): Promise<OCRResult> {
    try {
        // 动态导入 pdf-parse
        const pdfParse = (await import("pdf-parse")).default;
        const data = await pdfParse(Buffer.from(pdfBuffer));

        return {
            text: data.text,
            metadata: {
                pages: data.numpages,
            },
        };
    } catch (error: any) {
        console.error("[pdf-parse] Error:", error.message);
        return {
            text: "Failed to extract text from PDF",
            metadata: { pages: 1 },
        };
    }
}

// ==================== GPT 分析 ====================

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
        ocrResult.formulas.forEach((f) => {
            prompt += `- Page ${f.page}: ${f.formula}\n`;
        });
        prompt += "\n";
    }

    prompt += `
## Task
Extract neural network architecture and return JSON:
{
  "nodes": [
    {"id": "0", "type": "LayerType", "x": 100, "y": 100, "props": {...}, "notes": "..."}
  ],
  "edges": [[0, 1]],
  "meta": {"name": "Model Name", "notes": "Description"}
}`;

    return prompt;
}

async function analyzeWithGPT(ocrResult: OCRResult, filename: string) {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    console.log("[GPT] Analyzing...");

    const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content:
                    "Extract neural network architecture from research papers. Return JSON only.",
            },
            { role: "user", content: buildAnalysisPrompt(ocrResult) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0]?.message?.content || "{}");

    const nodes = (result.nodes || []).map((node: any, idx: number) => ({
        id: node.id || String(idx),
        type: node.type || "Unknown",
        x: node.x || 100 + (idx % 5) * 250,
        y: node.y || 100 + Math.floor(idx / 5) * 150,
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

// ==================== 任务状态管理 ====================

async function updateJobStatus(job: Partial<ProcessingJob> & { jobId: string }) {
    const existing = await redis.get<ProcessingJob>(`job:${job.jobId}`);

    // 从 job 中解构出 jobId，剩余的放入 rest
    const { jobId, ...restJob } = job;

    const updated: ProcessingJob = {
        // 必需字段
        jobId,
        status: existing?.status || "pending",
        progress: existing?.progress ?? 0,
        message: existing?.message || "",
        createdAt: existing?.createdAt || Date.now(),
        // updatedAt: Date.now(),
        // 展开其他字段（不包含 jobId）
        ...restJob,
        // 确保 updatedAt 始终是最新的
        updatedAt: Date.now(),
    };

    await redis.set(`job:${job.jobId}`, updated, { ex: 3600 }); // 1小时过期
    return updated;
}

// ==================== API Handler ====================

export async function POST(request: NextRequest) {
    let jobId: string | undefined;

    try {
        const { blobUrl, filename, jobId: requestJobId } = await request.json();

        // 验证必需参数
        if (!blobUrl || !filename || !requestJobId) {
            return NextResponse.json(
                { error: "Missing blobUrl, filename, or jobId" },
                { status: 400 }
            );
        }

        // 验证后，jobId 确定为 string 类型
        jobId = requestJobId as string;

        console.log(`[Process] Job ${jobId}: Starting for ${filename}`);

        // 初始化状态
        await updateJobStatus({
            jobId,
            status: "processing",
            progress: 10,
            message: "下载文件中...",
        });

        // 1. 从 Blob 下载
        console.log(`[Process] Downloading: ${blobUrl}`);
        const pdfResponse = await fetch(blobUrl);

        if (!pdfResponse.ok) {
            throw new Error(`Failed to download: ${pdfResponse.status}`);
        }

        const pdfBuffer = await pdfResponse.arrayBuffer();
        console.log(
            `[Process] Downloaded ${(pdfBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`
        );

        await updateJobStatus({
            jobId,
            progress: 30,
            message: "OCR 识别中...",
        });

        // 2. OCR
        const ocrResult = await callOCRService(pdfBuffer);
        console.log(`[Process] OCR: ${ocrResult.text.length} chars`);

        await updateJobStatus({
            jobId,
            progress: 60,
            message: "AI 分析中...",
        });

        // 3. GPT 分析
        const structure = await analyzeWithGPT(ocrResult, filename);
        console.log(`[Process] GPT: ${structure.nodes.length} nodes`);

        // 4. 完成
        await updateJobStatus({
            jobId,
            status: "completed",
            progress: 100,
            message: "处理完成！",
            result: structure,
        });

        console.log(`[Process] Job ${jobId}: Completed`);

        return NextResponse.json({
            success: true,
            jobId,
            structure,
        });
    } catch (error: any) {
        console.error("[Process] Error:", error);

        if (jobId) {
            await updateJobStatus({
                jobId,
                status: "error",
                progress: 0,
                message: "处理失败",
                error: error.message,
            });
        }

        return NextResponse.json(
            { error: error.message || "Processing failed" },
            { status: 500 }
        );
    }
}