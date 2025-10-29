"use client";

import React, { useState } from "react";
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
type Stage = "input" | "parsing" | "preview" | "complete";

export function SmartImportDialog({ open, onOpenChange, onImport }: SmartImportDialogProps) {
  const [mode, setMode] = useState<ImportMode>("github");
  const [stage, setStage] = useState<Stage>("input");
  
  // Input state
  const [githubUrl, setGithubUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  
  // Parsing state
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  
  // Preview/Edit state
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null);
  const [editedResult, setEditedResult] = useState<ParsedResult | null>(null);

  const resetDialog = () => {
    setStage("input");
    setGithubUrl("");
    setPdfFile(null);
    setProgress(0);
    setStatusMessage("");
    setParsedResult(null);
    setEditedResult(null);
  };

  const handleParse = async () => {
    setStage("parsing");
    setProgress(10);
    setStatusMessage("准备解析...");

    try {
      let response: Response;

      if (mode === "github") {
        if (!githubUrl.trim()) {
          throw new Error("请输入GitHub URL");
        }
        
        setStatusMessage("正在获取代码...");
        setProgress(30);

        response = await fetch("/api/smart-import/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "github",
            url: githubUrl,
          }),
        });
      } else {
        if (!pdfFile) {
          throw new Error("请上传PDF文件");
        }

        setStatusMessage("正在读取PDF...");
        setProgress(30);

        const formData = new FormData();
        formData.append("pdf", pdfFile);

        response = await fetch("/api/smart-import/parse", {
          method: "POST",
          body: formData,
        });
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "解析失败");
      }

      // 模拟进度更新（实际应该通过SSE或WebSocket）
      setProgress(60);
      setStatusMessage("AI 分析中...");

      await new Promise((resolve) => setTimeout(resolve, 1000));

      setProgress(90);
      setStatusMessage("生成模块结构...");

      const result: ParsedResult = await response.json();
      
      setProgress(100);
      setStatusMessage("解析完成！");
      
      setParsedResult(result);
      setEditedResult(JSON.parse(JSON.stringify(result))); // Deep clone
      
      setTimeout(() => setStage("preview"), 500);
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
                    <label
                      htmlFor="pdf-upload"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      <Upload className="w-8 h-8 text-slate-400" />
                      {pdfFile ? (
                        <div>
                          <p className="text-sm font-medium">{pdfFile.name}</p>
                          <p className="text-xs text-slate-500">
                            {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-medium">点击上传 PDF</p>
                          <p className="text-xs text-slate-500">或拖拽文件到此处</p>
                        </div>
                      )}
                    </label>
                  </div>
                  <p className="text-xs text-slate-500">
                    AI 将提取论文中的模型架构、网络层和参数信息。
                  </p>
                </div>
              </div>
            )}

            {/* Action Button */}
            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1 gap-2"
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
          </div>
        )}

        {/* Stage: Parsing */}
        {stage === "parsing" && (
          <div className="space-y-4 py-8">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-purple-500" />
              <div className="text-center">
                <p className="font-medium">{statusMessage}</p>
                <p className="text-sm text-slate-500 mt-1">这可能需要几秒钟...</p>
              </div>
              <div className="w-full max-w-xs">
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-center text-slate-500 mt-2">{progress}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Stage: Preview/Edit */}
        {stage === "preview" && editedResult && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">解析结果</h3>
                <Badge variant="secondary">
                  {editedResult.nodes.length} 个模块
                </Badge>
              </div>
              
              {editedResult.meta && (
                <div className="space-y-1">
                  {editedResult.meta.name && (
                    <p className="text-sm">
                      <span className="text-slate-500">模型名称: </span>
                      {editedResult.meta.name}
                    </p>
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
