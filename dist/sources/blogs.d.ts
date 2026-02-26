import Parser from "rss-parser";
import type { RadarConfig } from "../config";
import type { Candidate } from "./types";
declare function matchesKeywords(text: string, keywords: string[]): boolean;
export declare function collectBlogs(config: RadarConfig, parser?: Parser): Promise<Candidate[]>;
export { matchesKeywords };
//# sourceMappingURL=blogs.d.ts.map