import type { RadarConfig } from "../config";
import type { Candidate } from "../sources/types";
export declare function extractUrlsFromMarkdown(markdown: string): Set<string>;
type ReadFileFn = (path: string, encoding: BufferEncoding) => string;
export declare function dedup(candidates: Candidate[], config: RadarConfig, readFileFn?: ReadFileFn): Candidate[];
export {};
//# sourceMappingURL=dedup.d.ts.map