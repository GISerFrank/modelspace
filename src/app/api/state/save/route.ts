export const runtime = "edge";
export const dynamic = "force-dynamic";

import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

type State = {
    nodes: any[];
    edges: number[][];
    meta: { name: string; notes?: string };
};

export async function POST(req: Request) {
    try {
        const { projectId, data } = (await req.json()) as { projectId: string; data: State };
        if (!projectId || !data) return new Response("projectId & data required", { status: 400 });

        // EX 单位是秒；这里设置 30 天
        await redis.set(`project:${projectId}`, { ...data, updatedAt: Date.now() }, { ex: 60 * 60 * 24 * 30 });

        return Response.json({ ok: true });
    } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
    }
}
