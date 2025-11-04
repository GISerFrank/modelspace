// src/types/index.ts
// 类型定义

export interface ModuleNode {
    id: string;
    type: string;
    x: number;
    y: number;
    props: Record<string, any>;
    notes?: string;
}

export interface ModelMeta {
    name: string;
    notes: string;
    author?: string;
    version?: string;
}

export interface ModuleTypeInfo {
    type: string;
    color: string;
    kind: string;
    d: Record<string, any>;
}

export interface ModuleKnowledge {
    principle?: string;
    training?: string;
    demo?: string;
}

export interface ArchitectureStats {
    totalModules: number;
    totalConnections: number;
    moduleDistribution: Record<string, number>;
    estimatedParams?: string;
}

export interface ValidationResult {
    headline: string;
    summary: string;
    traits: string[];
    apps: string[];
    warnings: string[];
}