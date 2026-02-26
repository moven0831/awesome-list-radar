import { Octokit } from "@octokit/rest";
import * as core from "@actions/core";
import type { RadarConfig } from "../config";
import type { Candidate } from "./types";

const MAX_DESCRIPTION_LENGTH = 1000;

function createdAfterDate(spec: string): string {
  const days = parseInt(spec.replace("d", ""), 10);
  if (Number.isNaN(days)) {
    throw new Error(`Invalid date spec: ${spec}`);
  }
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

function buildSearchQuery(
  topics: string[],
  config: RadarConfig
): string {
  const gh = config.sources.github!;
  const parts: string[] = [];

  // Use OR for topics: match repos with any of the listed topics
  const topicClauses = topics.map((t) => `topic:${t}`);
  parts.push(topicClauses.join(" "));

  if (gh.languages) {
    // Use OR for languages: match repos in any of the listed languages
    const langClauses = gh.languages.map((l) => `language:${l}`);
    parts.push(langClauses.join(" "));
  }

  if (gh.min_stars > 0) {
    parts.push(`stars:>=${gh.min_stars}`);
  }

  const after = createdAfterDate(gh.created_after);
  parts.push(`created:>=${after}`);

  return parts.join(" ");
}

export async function collectGitHub(
  config: RadarConfig,
  octokit?: Octokit
): Promise<Candidate[]> {
  if (!config.sources.github) return [];

  const client =
    octokit ?? new Octokit({ auth: core.getInput("github_token") });
  const query = buildSearchQuery(config.sources.github.topics, config);

  core.info(`GitHub search query: ${query}`);

  const candidates: Candidate[] = [];

  try {
    // Note: fetches a single page (100 results) sorted by stars.
    // GitHub Search API supports up to 1000 results via pagination,
    // but for a radar scan the top 100 by stars is sufficient.
    const response = await client.search.repos({
      q: query,
      sort: "stars",
      order: "desc",
      per_page: 100,
    });

    for (const repo of response.data.items) {
      candidates.push({
        url: repo.html_url,
        title: repo.full_name,
        description: (repo.description ?? "").slice(0, MAX_DESCRIPTION_LENGTH),
        source: "github",
        metadata: {
          stars: repo.stargazers_count,
          language: repo.language ?? undefined,
          topics: repo.topics ?? [],
        },
      });
    }
  } catch (error) {
    core.warning(
      `GitHub search failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return candidates;
}

export { buildSearchQuery, createdAfterDate };
