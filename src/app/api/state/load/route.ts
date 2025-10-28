export const runtime = "edge";
export const dynamic = "force-dynamic";

import { Redis } from "@upstash/redis";
// const redis = Redis.fromEnv();
const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
});

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const projectId = url.searchParams.get("projectId");
        if (!projectId) return new Response("projectId required", { status: 400 });

        const data = await redis.get(`project:${projectId}`);
        return Response.json({ data });
    } catch (e: any) {
        return Response.json({ data: null, error: e?.message || String(e) }, { status: 500 });
    }
}
