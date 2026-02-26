import * as core from "@actions/core";
import type { RadarConfig } from "./config";
import type { Candidate, ClassifiedCandidate } from "./sources/types";

export interface PipelineResult {
  candidatesFound: number;
  candidatesFiltered: number;
  issuesCreated: number;
}

export interface PipelineDeps {
  collect: (config: RadarConfig) => Promise<Candidate[]>;
  filter: (
    candidates: Candidate[],
    config: RadarConfig
  ) => Promise<Candidate[]>;
  classify: (
    candidates: Candidate[],
    config: RadarConfig
  ) => Promise<ClassifiedCandidate[]>;
  output: (
    candidates: ClassifiedCandidate[],
    config: RadarConfig,
    dryRun: boolean
  ) => Promise<number>;
}

export async function runPipeline(
  config: RadarConfig,
  deps: PipelineDeps,
  dryRun: boolean
): Promise<PipelineResult> {
  core.info("Stage 1/4: Collecting candidates...");
  const collected = await deps.collect(config);
  core.info(`  Found ${collected.length} candidates`);

  core.info("Stage 2/4: Filtering candidates...");
  const filtered = await deps.filter(collected, config);
  core.info(`  ${filtered.length} candidates after filtering`);

  core.info("Stage 3/4: Classifying candidates...");
  const classified = await deps.classify(filtered, config);
  core.info(`  ${classified.length} candidates classified`);

  core.info("Stage 4/4: Creating output...");
  const issuesCreated = await deps.output(classified, config, dryRun);
  core.info(`  ${issuesCreated} issues created`);

  return {
    candidatesFound: collected.length,
    candidatesFiltered: filtered.length,
    issuesCreated,
  };
}
