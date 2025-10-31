// src/app/api/smart-import/pdf/upload/route.ts
// 上传大 PDF 文件到 Vercel Blob Storage

export const runtime = "edge";

import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

const SIZE_THRESHOLD = 4 * 1024 * 1024; // 4MB
const MAX_SIZE = 500 * 1024 * 1024; // 500MB

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        // 验证文件类型
        if (file.type !== "application/pdf") {
            return NextResponse.json(
                { error: "Only PDF files are supported" },
                { status: 400 }
            );
        }

        // 验证文件大小
        if (file.size > MAX_SIZE) {
            return NextResponse.json(
                { error: `File exceeds maximum size of ${MAX_SIZE / 1024 / 1024}MB` },
                { status: 413 }
            );
        }

        const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
        console.log(`[PDF Upload] File: ${file.name}, Size: ${fileSizeMB}MB`);

        // 小文件建议使用直接处理
        if (file.size < SIZE_THRESHOLD) {
            console.log("[PDF Upload] File is small, suggesting direct processing");
            return NextResponse.json({
                success: true,
                mode: "direct",
                message: `File is small (${fileSizeMB}MB). Use /api/smart-import/pdf/direct for faster processing`,
                file: {
                    name: file.name,
                    size: file.size,
                },
                redirect: "/api/smart-import/pdf/direct",
            });
        }

        // 大文件上传到 Blob
        console.log("[PDF Upload] Uploading to Blob Storage...");

        const blob = await put(file.name, file, {
            access: "public",
            addRandomSuffix: true,
        });

        console.log(`[PDF Upload] Uploaded: ${blob.url}`);

        // 生成 jobId
        const jobId =
            blob.url.split("/").pop()?.split(".")[0] || Date.now().toString();

        // 触发异步处理（不等待响应）
        const processUrl = `${
            process.env.NEXT_PUBLIC_URL || request.nextUrl.origin
        }/api/smart-import/pdf/process`;

        fetch(processUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                blobUrl: blob.url,
                filename: file.name,
                jobId,
            }),
        }).catch((error) => {
            console.error("[PDF Upload] Failed to trigger processing:", error);
        });

        return NextResponse.json({
            success: true,
            mode: "async",
            jobId,
            blobUrl: blob.url,
            message: "文件已上传，正在后台处理...",
        });
    } catch (error: any) {
        console.error("[PDF Upload] Error:", error);
        return NextResponse.json(
            { error: error.message || "Upload failed" },
            { status: 500 }
        );
    }
}