// lib/prompt.ts
export function buildContextSummary(nodes: any[] = [], edges: number[][] = [], notes = '') {
    return {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        hasNotes: !!notes,
        preview: (nodes.slice(0, 5).map((n:any)=>n.type)).join(', '),
    };
}
