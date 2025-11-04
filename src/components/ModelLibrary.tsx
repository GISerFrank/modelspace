// ModelLibrary.tsx - 优化后的模型库组件（修复 lucide 品牌图标警告）
"use client";

import React, { useState, useEffect } from "react";
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
  Filter,
  FileText,
  Zap,
  Eye,
  Brain,
  Image as ImageIcon,
  MessageSquare,
} from "lucide-react";

// ===== 品牌图标 SVG 组件 =====
// 替代 lucide-react 中已弃用的品牌图标

const GithubIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

const HuggingFaceIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32" fill="none">
    {/* 黄色圆形背景 */}
    <circle cx="16" cy="16" r="14" fill="#FFD21E"/>
    {/* 左眼 - 椭圆形 */}
    <ellipse cx="12" cy="12.5" rx="2" ry="2.5" fill="#000"/>
    {/* 右眼 - 椭圆形 */}
    <ellipse cx="20" cy="12.5" rx="2" ry="2.5" fill="#000"/>
    {/* 开心的微笑 - 更弯曲 */}
    <path 
      d="M 9 18 Q 16 24 23 18" 
      stroke="#000" 
      strokeWidth="2" 
      fill="none" 
      strokeLinecap="round"
    />
    {/* 左腮红 */}
    <ellipse cx="8" cy="17" rx="2" ry="1.5" fill="#FF6B6B" opacity="0.3"/>
    {/* 右腮红 */}
    <ellipse cx="24" cy="17" rx="2" ry="1.5" fill="#FF6B6B" opacity="0.3"/>
  </svg>
);

// ===== 模型分类和图标映射 =====
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
    // 可以添加 toast 提示
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
          {Object.entries(MODEL_CATEGORIES).map(([key, { label, icon: Icon, color }]) => (
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
                        <div className="space-y-1 pl-5 animate-in slide-in-from-top-2 duration-200">
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

                  {/* 代码仓库链接 */}
                  {(links.github || links.hf) && (
                    <div className="flex gap-2 pt-1">
                      {links.github && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={links.github}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                              >
                                <GithubIcon className="w-3.5 h-3.5" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>查看 GitHub 仓库</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      
                      {links.hf && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={links.hf}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                              >
                                <HuggingFaceIcon className="w-3.5 h-3.5" />
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
