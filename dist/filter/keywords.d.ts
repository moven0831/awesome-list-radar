import type { RadarConfig } from "../config";
import type { Candidate } from "../sources/types";
declare function getAllKeywords(config: RadarConfig): string[];
declare function matchesAnyKeyword(text: string, keywords: string[]): boolean;
export declare function filterCandidates(candidates: Candidate[], config: RadarConfig): Candidate[];
export { getAllKeywords, matchesAnyKeyword };
//# sourceMappingURL=keywords.d.ts.map