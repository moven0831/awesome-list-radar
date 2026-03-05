import * as core from "@actions/core";
import { loadConfig } from "./config";
import { runPipeline } from "./pipeline";
import { collectGitHub } from "./sources/github";
import { collectArxiv } from "./sources/arxiv";
import { collectBlogs } from "./sources/blogs";
import { collectWebPages } from "./sources/web_pages";
import { filterCandidates } from "./filter/keywords";
import { dedup } from "./filter/dedup";
import { classifyCandidates } from "./classifier/llm";
import { createIssues } from "./output/issues";
import {
  loadState,
  saveState,
  filterSeenCandidates,
  recordCandidates,
} from "./state";
import type { RadarConfig } from "./config";
import type { Candidate } from "./sources/types";

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
  if (config.sources.web_pages) {
    candidates.push(...(await collectWebPages(config)));
  }

  return candidates;
}

async function run(): Promise<void> {
  try {
    const configPath = core.getInput("config_path");
    const dryRun = core.getInput("dry_run") === "true";

    core.info(`Loading config from ${configPath}`);
    const config = loadConfig(configPath);

    // Load state
    const state = loadState(config.state_file);

    const result = await runPipeline(
      config,
      {
        collect,
        filter: async (candidates, cfg) => {
          // First filter out already-seen candidates
          const unseen = filterSeenCandidates(candidates, state);
          // Then apply keyword filtering and dedup
          const keywordFiltered = filterCandidates(unseen, cfg);
          const metadataResult = dedup(keywordFiltered, cfg);

          // Record candidates that were filtered out
          const filteredOut = unseen.filter(
            (c) => !metadataResult.includes(c)
          );
          recordCandidates(state, filteredOut, "filtered");

          return metadataResult;
        },
        classify: async (candidates, cfg) => {
          const classified = await classifyCandidates(candidates, cfg);

          // Record accepted (classified) and rejected (below threshold) candidates
          const classifiedUrls = new Set(classified.map((c) => c.url));
          const rejected = candidates.filter(
            (c) => !classifiedUrls.has(c.url)
          );
          recordCandidates(state, classified, "accepted");
          recordCandidates(state, rejected, "rejected");

          return classified;
        },
        output: createIssues,
      },
      dryRun
    );

    // Save state
    saveState(config.state_file, state);

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
