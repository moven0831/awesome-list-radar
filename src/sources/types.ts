export interface Candidate {
  url: string;
  title: string;
  description: string;
  source: "github" | "arxiv" | "blog" | "web_page";
  metadata: CandidateMetadata;
}

export interface CandidateMetadata {
  stars?: number;
  language?: string;
  topics?: string[];
  authors?: string[];
  publishedAt?: string;
  feedName?: string;
  pageName?: string;
}

export interface ClassifiedCandidate extends Candidate {
  relevanceScore: number;
  suggestedCategory: string;
  suggestedTags: string[];
  reasoning: string;
}
