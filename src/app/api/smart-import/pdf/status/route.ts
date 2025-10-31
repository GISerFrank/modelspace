// src/app/api/smart-import/pdf/status/route.ts
// 查询 PDF 处理任务状态

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

// 初始化 Redis
const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
});

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

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get("jobId");

        if (!jobId) {
            return NextResponse.json(
                { error: "Missing jobId parameter" },
                { status: 400 }
            );
        }

        // 从 Redis 获取任务状态
        const job = await redis.get<ProcessingJob>(`job:${jobId}`);

        if (!job) {
            return NextResponse.json(
                {
                    error: "Job not found",
                    message: "Job may have expired (jobs expire after 1 hour)",
                },
                { status: 404 }
            );
        }

        return NextResponse.json({
            jobId: job.jobId,
            status: job.status,
            progress: job.progress,
            message: job.message,
            result: job.result,
            error: job.error,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
        });
    } catch (error: any) {
        console.error("[Status] Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to get status" },
            { status: 500 }
        );
    }
}