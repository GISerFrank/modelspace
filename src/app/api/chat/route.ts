// app/api/chat/route.ts
export const runtime = "edge";

import OpenAI from "openai";

type ClientPayload = {
    messages: { role: "user" | "assistant" | "system"; content: string }[];
    context?: {
        modelMeta?: { name: string; notes?: string };
        nodes?: Array<{ id: string; type: string; props?: Record<string, any> }>;
        edges?: number[][];
        selectedNodeType?: string | null;
    };
};

function buildSystemPrompt(ctx: ClientPayload["context"]) {
    const name = ctx?.modelMeta?.name ?? "Untitled Model";
    const notes = ctx?.modelMeta?.notes ? `Notes: ${ctx.modelMeta.notes.slice(0, 800)}` : "";
    const nodes = (ctx?.nodes ?? []).slice(0, 50).map((n) => n.type).join(", ");
    const selected = ctx?.selectedNodeType ? `User is focusing on: ${ctx.selectedNodeType}` : "";
    return [
        `You are an assistant inside an AI model puzzle builder UI.`,
        `Project: ${name}`,
        selected,
        `Modules on canvas: ${nodes || "none"}`,
        notes,
        `Be concise. When suggesting papers/modules, list 1–3 solid options with brief reasons.`,
    ]
        .filter(Boolean)
        .join("\n");
}

export async function POST(req: Request) {
    if (!process.env.OPENAI_API_KEY) {
        return new Response(JSON.stringify({ error: "OPENAI_API_KEY not set" }), { status: 500 });
    }

    const body = (await req.json()) as ClientPayload;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // —— 用 Chat Completions，避免 Responses API 的类型坑
    const system = buildSystemPrompt(body.context);
    const messages = [
        { role: "system" as const, content: system },
        ...body.messages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    ];

    const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages,
        stream: true,
    });

    // —— 把 SSE token 转为 NDJSON（与你现在前端解析逻辑一致）
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            try {
                for await (const chunk of completion) {
                    const token = chunk.choices?.[0]?.delta?.content;
                    if (token) {
                        // 与前端约定的事件格式
                        const line = JSON.stringify({ type: "response.output_text.delta", delta: token }) + "\n";
                        controller.enqueue(encoder.encode(line));
                    }
                }
                controller.enqueue(encoder.encode(JSON.stringify({ type: "response.completed" }) + "\n"));
                controller.close();
            } catch (err: any) {
                controller.enqueue(
                    encoder.encode(JSON.stringify({ type: "response.error", error: err?.message || String(err) }) + "\n")
                );
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
        },
    });
}
