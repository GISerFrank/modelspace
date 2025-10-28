// lib/prompt.spec.ts
import { describe, it, expect } from 'vitest';
import { buildContextSummary } from './prompt';

describe('buildContextSummary', () => {
    it('empty', () => {
        const s = buildContextSummary([], [], '');
        expect(s.nodeCount).toBe(0);
        expect(s.hasNotes).toBe(false);
    });
    it('basic', () => {
        const s = buildContextSummary([{type:'Tokenizer'},{type:'TransformerDecoder'}], [[0,1]], 'foo');
        expect(s.nodeCount).toBe(2);
        expect(s.edgeCount).toBe(1);
        expect(s.hasNotes).toBe(true);
        expect(s.preview).toContain('Tokenizer');
    });
});
