export const runtime = "edge";
export const dynamic = "force-dynamic";

import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

type Msg = { role: "user" | "assistant" | "system"; content: string };

export async function POST(req: Request) {
    try {
        const { conversationId, messages } = (await req.json()) as {
            conversationId: string;
            messages: Msg[]; // 一次可推多条：如 {user} 和 {assistant}
        };
        if (!conversationId || !Array.isArray(messages)) {
            return new Response("conversationId & messages required", { status: 400 });
        }

        const key = `chat:${conversationId}`;
        // Upstash Redis 需要字符串；我们用 JSON 序列化
        await redis.rpush(key, ...messages.map((m) => JSON.stringify(m)));
        // 设置会话 TTL（30 天）
        await redis.expire(key, 60 * 60 * 24 * 30);

        return Response.json({ ok: true });
    } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
    }
}
