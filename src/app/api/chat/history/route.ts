export const runtime = "edge";
export const dynamic = "force-dynamic";

import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const conversationId = url.searchParams.get("conversationId");
        if (!conversationId) return new Response("conversationId required", { status: 400 });

        const key = `chat:${conversationId}`;
        const arr = await redis.lrange<string>(key, 0, -1);
        const messages = (arr || [])
            .map((s) => {
                try {
                    return JSON.parse(s);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);

        return Response.json({ messages });
    } catch (e: any) {
        return Response.json({ messages: [], error: e?.message || String(e) }, { status: 500 });
    }
}
