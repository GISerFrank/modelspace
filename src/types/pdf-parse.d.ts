// src/types/pdf-parse.d.ts
// TypeScript 类型声明 for pdf-parse

declare module "pdf-parse" {
    interface PDFData {
        numpages: number;
        numrender: number;
        info: any;
        metadata: any;
        text: string;
        version: string;
    }

    interface PDFParseOptions {
        pagerender?: (pageData: any) => string;
        max?: number;
        version?: string;
    }

    function PDFParse(
        dataBuffer: Buffer,
        options?: PDFParseOptions
    ): Promise<PDFData>;

    export = PDFParse;
}