export interface Candidate {
    url: string;
    title: string;
    description: string;
    source: "github" | "arxiv" | "blog";
    metadata: CandidateMetadata;
}
export interface CandidateMetadata {
    stars?: number;
    language?: string;
    topics?: string[];
    authors?: string[];
    publishedAt?: string;
    feedName?: string;
}
export interface ClassifiedCandidate extends Candidate {
    relevanceScore: number;
    suggestedCategory: string;
    suggestedTags: string[];
    reasoning: string;
}
//# sourceMappingURL=types.d.ts.map