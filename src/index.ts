import * as core from "@actions/core";
import { loadConfig } from "./config.js";
import { runPipeline } from "./pipeline.js";
import { collectGitHub } from "./sources/github.js";
import { collectArxiv } from "./sources/arxiv.js";
import { collectBlogs } from "./sources/blogs.js";
import { filterCandidates } from "./filter/keywords.js";
import { dedup } from "./filter/dedup.js";
import { classifyCandidates } from "./classifier/llm.js";
import { createIssues } from "./output/issues.js";
import type { RadarConfig } from "./config.js";
import type { Candidate } from "./sources/types.js";

async function collect(config: RadarConfig): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  if (config.sources.github) {
    candidates.push(...(await collectGitHub(config)));
  }
  if (config.sources.arxiv) {
    candidates.push(...(await collectArxiv(config)));
  }
  if (config.sources.blogs) {
    candidates.push(...(await collectBlogs(config)));
  }

  return candidates;
}

async function filter(
  candidates: Candidate[],
  config: RadarConfig
): Promise<Candidate[]> {
  const keywordFiltered = filterCandidates(candidates, config);
  return dedup(keywordFiltered, config);
}

async function run(): Promise<void> {
  try {
    const configPath = core.getInput("config_path");
    const dryRun = core.getInput("dry_run") === "true";

    core.info(`Loading config from ${configPath}`);
    const config = loadConfig(configPath);

    const result = await runPipeline(
      config,
      {
        collect,
        filter,
        classify: classifyCandidates,
        output: createIssues,
      },
      dryRun
    );

    core.setOutput("candidates_found", result.candidatesFound);
    core.setOutput("candidates_filtered", result.candidatesFiltered);
    core.setOutput("issues_created", result.issuesCreated);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unexpected error occurred");
    }
  }
}

run();
