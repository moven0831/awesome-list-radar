import { Octokit } from "@octokit/rest";
import type { RadarConfig } from "../config";
import type { Candidate } from "./types";
declare function createdAfterDate(spec: string): string;
declare function buildSearchQuery(topics: string[], config: RadarConfig): string;
export declare function collectGitHub(config: RadarConfig, octokit?: Octokit): Promise<Candidate[]>;
export { buildSearchQuery, createdAfterDate };
//# sourceMappingURL=github.d.ts.map