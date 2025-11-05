// ModelLibrary.tsx - 使用本地 SVG 文件版本
"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ExternalLink,
  Star,
  ChevronDown,
  ChevronUp,
  Copy,
  Search,
  FileText,
  Zap,
  Eye,
  Brain,
  Image as ImageIcon,
  MessageSquare,
} from "lucide-react";

// ===== 不再需要内联 SVG 组件定义 =====
// 图标现在直接从 public/icons/ 文件夹加载

// 模型分类和图标映射
const MODEL_CATEGORIES = {
  llm: { label: "大语言模型", icon: MessageSquare, color: "text-blue-500 bg-blue-50" },
  multimodal: { label: "多模态", icon: Eye, color: "text-purple-500 bg-purple-50" },
  vision: { label: "视觉", icon: ImageIcon, color: "text-green-500 bg-green-50" },
  diffusion: { label: "扩散模型", icon: Zap, color: "text-orange-500 bg-orange-50" },
};

interface ModelLibraryProps {
  modelLibrary: Record<string, {
    title: string;
    desc: string;
    primary?: { name: string; url: string };
    variants?: { name: string; url: string }[];
  }>;
  modelLinks: Record<string, { github?: string; hf?: string; ms?: string }>;
  onLoadTemplate: (key: string) => void;
}

export function ModelLibrary({
                               modelLibrary,
                               modelLinks,
                               onLoadTemplate
                             }: ModelLibraryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  // 防止 hydration 错误
  useEffect(() => {
    setMounted(true);
  }, []);

  // 服务端渲染时显示加载状态
  if (!mounted) {
    return (
        <div className="flex items-center justify-center p-8 text-slate-400">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-400"></div>
        </div>
    );
  }

  // 模型分类映射
  const modelCategories: Record<string, keyof typeof MODEL_CATEGORIES> = {
    "GPT (Decoder-only)": "llm",
    "BERT (Encoder-only)": "llm",
    "T5 (Seq2Seq)": "llm",
    "CLIP": "multimodal",
    "Stable Diffusion": "diffusion",
  };

  // 筛选逻辑
  const filteredModels = Object.entries(modelLibrary).filter(([key, model]) => {
    const matchesSearch =
        key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.desc.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = !selectedCategory ||
        modelCategories[key] === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const toggleExpand = (key: string) => {
    const newExpanded = new Set(expandedModels);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedModels(newExpanded);
  };

  const toggleFavorite = (key: string) => {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(key)) {
      newFavorites.delete(key);
    } else {
      newFavorites.add(key);
    }
    setFavorites(newFavorites);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
      <div className="space-y-4">
        {/* 搜索和筛选栏 */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
                placeholder="搜索模型..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
            />
          </div>

          {/* 分类筛选 */}
          <div className="flex gap-2 flex-wrap">
            <Button
                size="sm"
                variant={selectedCategory === null ? "default" : "outline"}
                onClick={() => setSelectedCategory(null)}
                className="h-7 text-xs"
            >
              全部
            </Button>
            {Object.entries(MODEL_CATEGORIES).map(([key, { label, icon: Icon }]) => (
                <Button
                    key={key}
                    size="sm"
                    variant={selectedCategory === key ? "default" : "outline"}
                    onClick={() => setSelectedCategory(key as any)}
                    className="h-7 text-xs gap-1.5"
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </Button>
            ))}
          </div>
        </div>

        {/* 模型列表 */}
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
          {filteredModels.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                没有找到匹配的模型
              </div>
          ) : (
              filteredModels.map(([key, model]) => {
                const isExpanded = expandedModels.has(key);
                const isFavorite = favorites.has(key);
                const category = modelCategories[key];
                const categoryInfo = category ? MODEL_CATEGORIES[category] : null;
                const links = modelLinks[key] || {};

                return (
                    <Card
                        key={key}
                        className="group hover:shadow-md transition-all duration-200 border-slate-200 hover:border-slate-300"
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* 标题行 */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {/* 分类图标 */}
                              {categoryInfo && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <div className={`p-1.5 rounded-md ${categoryInfo.color}`}>
                                          <categoryInfo.icon className="w-3.5 h-3.5" />
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>{categoryInfo.label}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                              )}

                              {/* 标题 */}
                              <h4 className="font-semibold text-sm leading-tight truncate">
                                {model.title}
                              </h4>

                              {/* 收藏按钮 */}
                              <button
                                  onClick={() => toggleFavorite(key)}
                                  className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Star
                                    className={`w-4 h-4 ${
                                        isFavorite
                                            ? "fill-yellow-400 text-yellow-400"
                                            : "text-slate-300 hover:text-yellow-400"
                                    }`}
                                />
                              </button>
                            </div>

                            {/* 描述 */}
                            <p className="text-xs text-slate-600 line-clamp-2">
                              {model.desc}
                            </p>
                          </div>
                        </div>

                        {/* 主要论文链接 */}
                        {model.primary && (
                            <a
                                href={model.primary.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 text-xs text-slate-700 hover:text-blue-600
                               bg-slate-50 hover:bg-blue-50 px-2.5 py-1.5 rounded-md
                               transition-colors group/link"
                            >
                              <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="flex-1 truncate font-medium">
                        {model.primary.name}
                      </span>
                              <ExternalLink className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                            </a>
                        )}

                        {/* 变体列表（可展开） */}
                        {model.variants && model.variants.length > 0 && (
                            <div className="space-y-1.5">
                              <button
                                  onClick={() => toggleExpand(key)}
                                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                              >
                                {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                )}
                                <span className="font-medium">
                          {model.variants.length} 个变体
                        </span>
                              </button>

                              {isExpanded && (
                                  <div className="space-y-1 pl-5">
                                    {model.variants.map((variant, idx) => (
                                        <a
                                            key={idx}
                                            href={variant.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600
                                       hover:bg-slate-50 px-2 py-1 rounded transition-colors group/variant"
                                        >
                                          <div className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />
                                          <span className="flex-1 truncate">{variant.name}</span>
                                          <ExternalLink className="w-3 h-3 opacity-0 group-hover/variant:opacity-100 transition-opacity" />
                                        </a>
                                    ))}
                                  </div>
                              )}
                            </div>
                        )}

                        {/* 代码仓库链接 - 使用本地 SVG 文件 */}
                        {(links.github || links.hf) && (
                            <div className="flex gap-2 pt-1">
                              {/* GitHub 图标 - 从 public/icons/github.svg 加载 */}
                              {links.github && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <a
                                            href={links.github}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="p-1.5 rounded-md hover:bg-slate-100 transition-colors"
                                        >
                                          <Image
                                              src="/icons/github.svg"
                                              alt="GitHub"
                                              width={24}
                                              height={24}
                                              className="opacity-60 hover:opacity-100 transition-opacity"
                                          />
                                        </a>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>查看 GitHub 仓库</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                              )}

                              {/* HuggingFace 图标 - 从 public/icons/huggingface.svg 加载 */}
                              {links.hf && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <a
                                            href={links.hf}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="p-1.5 rounded-md hover:bg-yellow-50 transition-colors"
                                        >
                                          <Image
                                              src="/icons/huggingface.svg"
                                              alt="HuggingFace"
                                              width={24}
                                              height={24}
                                              className="hover:scale-110 transition-transform"
                                          />
                                        </a>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>查看 HuggingFace</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                              )}

                              {/* 复制按钮 */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                        onClick={() => copyToClipboard(key)}
                                        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors ml-auto"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>复制模型名称</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              {/* 加载按钮 */}
                              <Button
                                  size="sm"
                                  onClick={() => onLoadTemplate(key)}
                                  className="h-7 px-3 text-xs gap-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                              >
                                <Brain className="w-3.5 h-3.5" />
                                加载模板
                              </Button>
                            </div>
                        )}
                      </CardContent>
                    </Card>
                );
              })
          )}
        </div>

        {/* 统计信息 */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t">
          <span>共 {filteredModels.length} 个模型</span>
          {favorites.size > 0 && (
              <span className="flex items-center gap-1">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                {favorites.size} 个收藏
          </span>
          )}
        </div>
      </div>
  );
}
