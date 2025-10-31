// src/app/api/smart-import/github/route.ts
// GitHub 代码解析 - 分析仓库或文件中的模型结构

export const runtime = "edge";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ==================== 类型定义 ====================
interface GitHubParseRequest {
    url: string;
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
        source: string;
    };
}

// ==================== GitHub 处理逻辑 ====================

/**
 * 解析 GitHub URL
 */
function parseGitHubUrl(url: string) {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split("/").filter(Boolean);

    // https://github.com/owner/repo
    if (parts.length === 2) {
        return {
            type: "repo" as const,
            owner: parts[0],
            repo: parts[1],
            branch: "main",
        };
    }

    // https://github.com/owner/repo/blob/branch/path/to/file.py
    if (parts.length > 4 && parts[2] === "blob") {
        return {
            type: "file" as const,
            owner: parts[0],
            repo: parts[1],
            branch: parts[3],
            path: parts.slice(4).join("/"),
        };
    }

    throw new Error("Invalid GitHub URL format. Expected: github.com/owner/repo or github.com/owner/repo/blob/branch/file");
}

/**
 * 获取单个文件内容
 */
async function fetchGitHubFile(parsed: {
    owner: string;
    repo: string;
    branch: string;
    path: string;
}): Promise<string> {
    const { owner, repo, branch, path } = parsed;
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;

    console.log(`[GitHub] Fetching file: ${rawUrl}`);

    const response = await fetch(rawUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
    }

    return await response.text();
}

/**
 * 搜索仓库中的模型文件
 */
async function fetchGitHubRepo(parsed: {
    owner: string;
    repo: string;
    branch: string;
}): Promise<string> {
    const { owner, repo, branch } = parsed;

    console.log(`[GitHub] Searching repository: ${owner}/${repo}`);

    // 常见的模型文件路径
    const searchPaths = [
        "model.py",
        "models.py",
        "modeling.py",
        "network.py",
        "architecture.py",
        "src/model.py",
        "src/models.py",
        "models/model.py",
    ];

    let contents: string[] = [];

    for (const searchPath of searchPaths) {
        try {
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${searchPath}`;
            const response = await fetch(rawUrl);

            if (response.ok) {
                const text = await response.text();
                contents.push(`# File: ${searchPath}\n${text}\n\n`);
                console.log(`[GitHub] Found: ${searchPath}`);
            }
        } catch (error) {
            continue;
        }
    }

    if (contents.length === 0) {
        throw new Error(
            "No model files found in repository. Please provide a direct file URL (e.g., github.com/owner/repo/blob/main/model.py)"
        );
    }

    return contents.join("\n");
}

/**
 * 从 GitHub URL 获取代码内容
 */
async function fetchGitHubContent(url: string): Promise<string> {
    const parsed = parseGitHubUrl(url);

    if (parsed.type === "file") {
        return await fetchGitHubFile(parsed);
    } else {
        return await fetchGitHubRepo(parsed);
    }
}

/**
 * 使用 GPT 分析代码并提取模型结构
 */
async function analyzeCodeWithGPT(
    code: string,
    sourceUrl: string
): Promise<ModelStructure> {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    console.log("[GPT] Analyzing code structure...");

    const systemPrompt = `You are an expert at analyzing neural network code and extracting architecture information.

Given source code (Python/PyTorch/TensorFlow/JAX/etc.), extract the model architecture and return a structured JSON.

Focus on:
1. Layer/module definitions (nn.Module, keras.Layer, etc.)
2. Forward pass logic and layer connections
3. Model composition (Sequential, functional, etc.)
4. Hyperparameters (dimensions, layers, heads, dropout, etc.)

Return JSON in this EXACT format:
{
  "nodes": [
    {
      "id": "0",
      "type": "Input",
      "x": 100,
      "y": 100,
      "props": {},
      "notes": ""
    },
    {
      "id": "1",
      "type": "Embedding",
      "x": 100,
      "y": 200,
      "props": {"dim": 768},
      "notes": "Token embeddings"
    }
  ],
  "edges": [[0, 1], [1, 2]],
  "meta": {
    "name": "ModelName",
    "notes": "Brief description of the model",
    "source": "github"
  }
}

Common layer types: Input, Embedding, PositionalEncoding, TransformerEncoder, TransformerDecoder, 
Attention, MultiHeadAttention, FeedForward, FFN, LayerNorm, Dropout, Linear, Dense, Conv2D, 
MaxPool, BatchNorm, Activation, ReLU, GELU, Softmax, Output, LMHead, ClassifierHead, etc.

IMPORTANT: Return ONLY valid JSON, no markdown formatting.`;

    const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: systemPrompt,
            },
            {
                role: "user",
                content: `Analyze this code and extract the model architecture:\n\n\`\`\`python\n${code.slice(
                    0,
                    15000
                )}\n\`\`\``,
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
            name: result.meta?.name || "GitHub Import",
            notes: result.meta?.notes || "Imported from GitHub repository",
            source: sourceUrl,
        },
    };
}

// ==================== API Handler ====================

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as GitHubParseRequest;
        const { url } = body;

        if (!url) {
            return NextResponse.json(
                { error: "GitHub URL is required" },
                { status: 400 }
            );
        }

        // 验证 GitHub URL
        if (!url.includes("github.com")) {
            return NextResponse.json(
                { error: "Invalid GitHub URL. Must be a github.com URL" },
                { status: 400 }
            );
        }

        console.log(`[GitHub API] Processing URL: ${url}`);

        // 1. 获取代码内容
        const code = await fetchGitHubContent(url);
        console.log(`[GitHub API] Fetched ${code.length} characters of code`);

        // 2. 使用 GPT 分析
        const structure = await analyzeCodeWithGPT(code, url);
        console.log(
            `[GitHub API] Extracted ${structure.nodes.length} nodes, ${structure.edges.length} edges`
        );

        return NextResponse.json({
            success: true,
            structure,
            stats: {
                code_length: code.length,
                nodes_count: structure.nodes.length,
                edges_count: structure.edges.length,
            },
        });
    } catch (error: any) {
        console.error("[GitHub API] Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || "Failed to parse GitHub repository",
            },
            { status: 500 }
        );
    }
}