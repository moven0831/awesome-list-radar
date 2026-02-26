import type { RadarConfig } from "../config";
import type { Candidate } from "./types";
declare function buildArxivQuery(config: RadarConfig): string;
declare function buildArxivUrl(query: string): string;
export declare function collectArxiv(config: RadarConfig, fetchFn?: typeof fetch): Promise<Candidate[]>;
export { buildArxivQuery, buildArxivUrl };
//# sourceMappingURL=arxiv.d.ts.map