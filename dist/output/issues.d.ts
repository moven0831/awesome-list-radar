import type { RadarConfig } from "../config";
import type { ClassifiedCandidate } from "../sources/types";
declare function escapeTableCell(value: string): string;
declare function buildIssueTitle(candidate: ClassifiedCandidate): string;
declare function buildIssueBody(candidate: ClassifiedCandidate): string;
export interface IssueClient {
    listIssues(labels: string[]): Promise<{
        title: string;
        body?: string;
    }[]>;
    createIssue(title: string, body: string, labels: string[]): Promise<{
        number: number;
        html_url: string;
    }>;
}
export declare function createIssues(candidates: ClassifiedCandidate[], config: RadarConfig, dryRun: boolean, client?: IssueClient): Promise<number>;
export { buildIssueTitle, buildIssueBody, escapeTableCell };
//# sourceMappingURL=issues.d.ts.map