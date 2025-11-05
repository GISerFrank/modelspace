"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Sparkles } from "lucide-react";
import { MODULE_TYPES, MODEL_LIBRARY, MODEL_LINKS, TEMPLATES } from "@/lib/constants";

interface ChatPanelProps {
    conversationId?: string;
    canInsertModule: boolean;
    onInsertModel: (t: string) => void;
    onInsertModule: (t: string) => void;
    selectedNodeType?: string | null;
    modelMeta: { name: string; notes?: string };
    nodes: any[];
    edges: number[][];
}

export function ChatPanel({
                              conversationId,
                              canInsertModule,
                              onInsertModel,
                              onInsertModule,
                              selectedNodeType,
                              modelMeta,
                              nodes,
                              edges,
                          }: ChatPanelProps) {
    type Msg = { role: "user" | "assistant"; content: string };
    const [messages, setMessages] = useState<Msg[]>([
        { role: "assistant", content: '👋 我可以帮你查找模块/模型，并把结果整理进备注。试着问："LoRA 是什么？" 或 "搜索 TransformerDecoder 的论文"。' },
    ]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);

    // 加载历史
    useEffect(() => {
        if (!conversationId) return;
        (async () => {
            const r = await fetch(`/api/chat/history?conversationId=${conversationId}`);
            const { messages: hist } = await r.json();
            if (Array.isArray(hist) && hist.length) setMessages(hist);
        })();
    }, [conversationId]);

    // 本地搜索函数
    function localSearch(q: string) {
        const ql = q.toLowerCase();
        const mods = MODULE_TYPES.filter((m) =>
            m.type.toLowerCase().includes(ql) || m.kind.toLowerCase().includes(ql)
        );
        const models = Object.entries(MODEL_LIBRARY).filter(
            ([k, v]) => k.toLowerCase().includes(ql) ||
                v.title.toLowerCase().includes(ql) ||
                v.desc.toLowerCase().includes(ql)
        );

        const parts: string[] = [];
        if (mods.length) {
            parts.push(`模块匹配 (${mods.length})\n` +
                mods.slice(0, 8).map(m => `• ${m.type} (${m.kind})`).join("\n")
            );
        }
        if (models.length) {
            parts.push(`模型匹配 (${models.length})`);
            parts.push(models.slice(0, 5).map(([k, v]) => `• ${v.title} — ${v.desc}`).join("\n"));
        }
        if (!parts.length) {
            parts.push('未找到匹配项，尝试换个关键词。');
        }
        return parts.join("\n\n");
    }

    // 发送消息
    async function onSend() {
        const q = input.trim();
        if (!q) return;
        setInput("");
        setBusy(true);

        setMessages((prev) => [...prev, { role: "user", content: q }, { role: "assistant", content: "" }]);
        const assistantIndex = messages.length + 1;

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                body: JSON.stringify({
                    messages: [...messages, { role: "user", content: q }],
                    context: { modelMeta, nodes, edges, selectedNodeType },
                }),
            });

            if (!res.ok || !res.body) throw new Error("network");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const evt = JSON.parse(line);
                        if (evt.type === "response.output_text.delta") {
                            setMessages((prev) => {
                                const copy = [...prev];
                                copy[assistantIndex] = {
                                    role: "assistant",
                                    content: (copy[assistantIndex]?.content || "") + evt.delta,
                                };
                                return copy;
                            });
                        }
                    } catch {}
                }
            }
        } catch {
            const ans = localSearch(q);
            setMessages((prev) => {
                const copy = [...prev];
                copy[assistantIndex] = { role: "assistant", content: ans };
                return copy;
            });
        } finally {
            setBusy(false);
        }
    }

    function toModel() {
        const last = messages[messages.length - 1];
        if (!last || last.role === "user") return;
        onInsertModel(last.content);
    }

    function toModule() {
        const last = messages[messages.length - 1];
        if (!last || last.role === "user") return;
        onInsertModule(last.content);
    }

    return (
        <Card>
            <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4" />
                    <div className="font-medium">AI Chat</div>
                    <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Beta
          </span>
                </div>
                <div className="border rounded-md p-2 h-[300px] overflow-auto bg-slate-50/60">
                    {messages.map((m, i) => (
                        <div
                            key={i}
                            className={`text-sm whitespace-pre-wrap ${
                                m.role === "user" ? "text-right my-2" : "text-left my-2"
                            }`}
                        >
              <span
                  className={`inline-block px-3 py-1.5 rounded-lg ${
                      m.role === "user"
                          ? "bg-blue-500 text-white"
                          : "bg-white border"
                  }`}
              >
                {m.content}
              </span>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2 mt-2">
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSend()}
                        placeholder="问点什么..."
                        disabled={busy}
                    />
                    <Button onClick={onSend} disabled={busy} size="icon">
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
                <div className="flex gap-2 mt-2">
                    <Button onClick={toModel} variant="outline" size="sm" className="flex-1 text-xs">
                        写入模型备注
                    </Button>
                    <Button
                        onClick={toModule}
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs"
                        disabled={!canInsertModule}
                    >
                        写入模块备注
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}