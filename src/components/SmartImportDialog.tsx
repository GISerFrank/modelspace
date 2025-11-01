"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Github, FileText, Upload, Loader2, Edit3, Check } from "lucide-react";

interface ParsedModule {
  type: string;
  props: Record<string, any>;
  notes?: string;
}

interface ParsedResult {
  nodes: ParsedModule[];
  edges: number[][];
  meta?: {
    name?: string;
    notes?: string;
    source?: string;
  };
}

interface SmartImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (result: ParsedResult) => void;
}

type ImportMode = "github" | "pdf";
type Stage = "input" | "uploading" | "processing" | "preview" | "complete";

export function SmartImportDialog({ open, onOpenChange, onImport }: SmartImportDialogProps) {
  const [mode, setMode] = useState<ImportMode>("github");
  const [stage, setStage] = useState<Stage>("input");

  // Input state
  const [githubUrl, setGithubUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // Processing state
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  // Preview/Edit state
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null);
  const [editedResult, setEditedResult] = useState<ParsedResult | null>(null);

  const resetDialog = () => {
    setStage("input");
    setGithubUrl("");
    setPdfFile(null);
    setJobId(null);
    setProgress(0);
    setStatusMessage("");
    setParsedResult(null);
    setEditedResult(null);
  };

  // 轮询处理状态
  useEffect(() => {
    if (!jobId || stage !== "processing") return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/smart-import/status?jobId=${jobId}`);

        if (!response.ok) {
          throw new Error("Failed to get status");
        }

        const data = await response.json();

        setProgress(data.progress);
        setStatusMessage(data.message);

        if (data.status === "completed" && data.result) {
          clearInterval(pollInterval);
          setParsedResult(data.result);
          setEditedResult(JSON.parse(JSON.stringify(data.result))); // Deep clone
          setStage("preview");
        } else if (data.status === "error") {
          clearInterval(pollInterval);
          setStatusMessage(`❌ ${data.error || "处理失败"}`);
          setTimeout(() => setStage("input"), 3000);
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 2000); // 每 2 秒轮询一次

    return () => clearInterval(pollInterval);
  }, [jobId, stage]);

  const handleParse = async () => {
    try {
      if (mode === "github") {
        // GitHub 模式 - 使用原有的 parse API
        if (!githubUrl.trim()) {
          throw new Error("请输入GitHub URL");
        }

        setStage("processing");
        setProgress(10);
        setStatusMessage("正在获取代码...");

        const response = await fetch("/api/smart-import/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "github",
            url: githubUrl,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "解析失败");
        }

        setProgress(60);
        setStatusMessage("AI 分析中...");

        const result: ParsedResult = await response.json();

        setProgress(100);
        setStatusMessage("解析完成！");

        setParsedResult(result);
        setEditedResult(JSON.parse(JSON.stringify(result)));

        setTimeout(() => setStage("preview"), 500);
      } else {
        // PDF 模式 - 使用 Vercel Blob 方案
        if (!pdfFile) {
          throw new Error("请上传PDF文件");
        }

        setStage("uploading");
        setProgress(5);
        setStatusMessage("上传文件中...");

        const formData = new FormData();
        formData.append("file", pdfFile);

        // 上传到 Blob
        const uploadResponse = await fetch("/api/smart-import/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const error = await uploadResponse.json();
          throw new Error(error.message || "上传失败");
        }

        const uploadData = await uploadResponse.json();

        if (!uploadData.success || !uploadData.jobId) {
          throw new Error("上传失败");
        }

        // 切换到处理阶段
        setJobId(uploadData.jobId);
        setStage("processing");
        setProgress(10);
        setStatusMessage("文件已上传,开始处理...");
      }
    } catch (error) {
      console.error("Parse error:", error);
      setStatusMessage(error instanceof Error ? error.message : "解析失败，请重试");
      setTimeout(() => setStage("input"), 2000);
    }
  };

  const handleImport = () => {
    if (editedResult) {
      onImport(editedResult);
      setStage("complete");
      setTimeout(() => {
        onOpenChange(false);
        resetDialog();
      }, 1500);
    }
  };

  const updateNodeNotes = (index: number, notes: string) => {
    if (!editedResult) return;
    const updated = { ...editedResult };
    updated.nodes[index].notes = notes;
    setEditedResult(updated);
  };

  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              智能导入
            </DialogTitle>
            <DialogDescription>
              使用 AI 从 GitHub 代码或论文 PDF 自动生成模块结构
            </DialogDescription>
          </DialogHeader>

          {/* Stage: Input */}
          {stage === "input" && (
              <div className="space-y-4">
                {/* Mode Selection */}
                <div className="flex gap-3">
                  <Button
                      variant={mode === "github" ? "default" : "outline"}
                      className="flex-1 gap-2"
                      onClick={() => setMode("github")}
                  >
                    <Github className="w-4 h-4" />
                    GitHub 仓库
                  </Button>
                  <Button
                      variant={mode === "pdf" ? "default" : "outline"}
                      className="flex-1 gap-2"
                      onClick={() => setMode("pdf")}
                  >
                    <FileText className="w-4 h-4" />
                    论文 PDF
                  </Button>
                </div>

                {/* GitHub Input */}
                {mode === "github" && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">GitHub URL</label>
                        <Input
                            placeholder="https://github.com/user/repo 或 https://github.com/user/repo/blob/main/model.py"
                            value={githubUrl}
                            onChange={(e) => setGithubUrl(e.target.value)}
                        />
                        <p className="text-xs text-slate-500">
                          支持仓库 URL 或具体文件 URL。AI 将分析代码结构并提取模型定义。
                        </p>
                      </div>
                    </div>
                )}

                {/* PDF Upload */}
                {mode === "pdf" && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">上传 PDF</label>
                        <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                          <input
                              type="file"
                              accept=".pdf"
                              onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                              className="hidden"
                              id="pdf-upload"
                          />
                          <label htmlFor="pdf-upload" className="cursor-pointer">
                            <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                            <p className="text-sm font-medium">
                              {pdfFile ? pdfFile.name : "点击上传 PDF"}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              支持最大 500MB 的 PDF 文件
                            </p>
                          </label>
                        </div>
                        <p className="text-xs text-slate-500">
                          AI 将使用 OCR 提取文本、表格、公式等内容，并分析模型架构。
                        </p>
                      </div>
                    </div>
                )}

                {/* Parse Button */}
                <Button
                    className="w-full gap-2"
                    onClick={handleParse}
                    disabled={
                        (mode === "github" && !githubUrl.trim()) ||
                        (mode === "pdf" && !pdfFile)
                    }
                >
                  <Sparkles className="w-4 h-4" />
                  开始解析
                </Button>
              </div>
          )}

          {/* Stage: Uploading or Processing */}
          {(stage === "uploading" || stage === "processing") && (
              <div className="py-8">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-12 h-12 animate-spin text-primary" />
                  <div className="text-center space-y-2">
                    <p className="font-medium">{statusMessage}</p>
                    <div className="w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                          className="h-full bg-primary transition-all duration-500"
                          style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-sm text-slate-500">{progress}%</p>
                  </div>
                </div>
              </div>
          )}

          {/* Stage: Preview */}
          {stage === "preview" && editedResult && (
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-lg p-4">
                  {editedResult.meta && (
                      <div className="space-y-1">
                        {editedResult.meta.name && (
                            <p className="font-medium">{editedResult.meta.name}</p>
                        )}
                        {editedResult.meta.notes && (
                            <p className="text-sm text-slate-600">{editedResult.meta.notes}</p>
                        )}
                        {editedResult.meta.source && (
                            <p className="text-xs text-slate-500">
                              来源: {editedResult.meta.source}
                            </p>
                        )}
                      </div>
                  )}
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <Edit3 className="w-4 h-4" />
                    <span className="text-sm font-medium">模块列表（可编辑）</span>
                  </div>

                  {editedResult.nodes.map((node, idx) => (
                      <div key={idx} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">{node.type}</p>
                            <p className="text-xs text-slate-500">
                              {Object.keys(node.props).length} 个参数
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            #{idx + 1}
                          </Badge>
                        </div>

                        <div className="text-xs space-y-1">
                          {Object.entries(node.props).slice(0, 3).map(([key, value]) => (
                              <div key={key} className="flex gap-2">
                                <span className="text-slate-500">{key}:</span>
                                <span className="font-mono">{String(value)}</span>
                              </div>
                          ))}
                        </div>

                        <div className="pt-2">
                    <textarea
                        placeholder="添加模块说明..."
                        value={node.notes || ""}
                        onChange={(e) => updateNodeNotes(idx, e.target.value)}
                        className="w-full text-xs rounded border px-2 py-1 min-h-[60px]"
                    />
                        </div>
                      </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setStage("input")}>
                    返回
                  </Button>
                  <Button className="flex-1 gap-2" onClick={handleImport}>
                    <Check className="w-4 h-4" />
                    导入到画布
                  </Button>
                </div>
              </div>
          )}

          {/* Stage: Complete */}
          {stage === "complete" && (
              <div className="py-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                    <Check className="w-8 h-8 text-green-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">导入成功！</p>
                    <p className="text-sm text-slate-500 mt-1">
                      模块已添加到画布
                    </p>
                  </div>
                </div>
              </div>
          )}
        </DialogContent>
      </Dialog>
  );
}