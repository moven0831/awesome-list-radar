import type { RadarConfig } from "./config";
import type { Candidate, ClassifiedCandidate } from "./sources/types";
export interface PipelineResult {
    candidatesFound: number;
    candidatesFiltered: number;
    issuesCreated: number;
}
export interface PipelineDeps {
    collect: (config: RadarConfig) => Promise<Candidate[]>;
    filter: (candidates: Candidate[], config: RadarConfig) => Promise<Candidate[]>;
    classify: (candidates: Candidate[], config: RadarConfig) => Promise<ClassifiedCandidate[]>;
    output: (candidates: ClassifiedCandidate[], config: RadarConfig, dryRun: boolean) => Promise<number>;
}
export declare function runPipeline(config: RadarConfig, deps: PipelineDeps, dryRun: boolean): Promise<PipelineResult>;
