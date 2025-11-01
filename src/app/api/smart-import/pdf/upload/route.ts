// src/app/api/smart-import/pdf/upload/route.ts
// 处理客户端直传 Blob 的上传请求

export const runtime = "edge";

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
    const body = (await request.json()) as HandleUploadBody;

    try {
        const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async (pathname) => {
                // 这里可以添加身份验证逻辑
                return {
                    allowedContentTypes: ['application/pdf'],
                    maximumSizeInBytes: 500 * 1024 * 1024, // 500MB
                };
            },
            onUploadCompleted: async ({ blob, tokenPayload }) => {
                // 上传完成后触发处理
                console.log('[Upload] Completed:', blob.url);

                // 生成 jobId
                const jobId = blob.pathname.split('/').pop()?.split('.')[0] || Date.now().toString();

                // 触发异步处理
                const processUrl = `${process.env.NEXT_PUBLIC_URL || new URL(request.url).origin}/api/smart-import/pdf/process`;

                fetch(processUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        blobUrl: blob.url,
                        filename: blob.pathname,
                        jobId,
                    }),
                }).catch((error) => {
                    console.error('[Upload] Failed to trigger processing:', error);
                });
            },
        });

        return NextResponse.json(jsonResponse);
    } catch (error: any) {
        console.error('[Upload] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Upload failed' },
            { status: 400 }
        );
    }
}