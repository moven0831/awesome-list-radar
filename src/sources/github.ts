import { Octokit } from "@octokit/rest";
import * as core from "@actions/core";
import type { RadarConfig } from "../config.js";
import type { Candidate } from "./types.js";

function createdAfterDate(spec: string): string {
  const days = parseInt(spec.replace("d", ""), 10);
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

function buildSearchQuery(config: RadarConfig): string {
  const gh = config.sources.github!;
  const parts: string[] = [];

  for (const topic of gh.topics) {
    parts.push(`topic:${topic}`);
  }

  if (gh.languages) {
    for (const lang of gh.languages) {
      parts.push(`language:${lang}`);
    }
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
  const query = buildSearchQuery(config);

  core.info(`GitHub search query: ${query}`);

  const candidates: Candidate[] = [];

  try {
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
        description: repo.description ?? "",
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

export { collectGitHub as collectAll };
export { buildSearchQuery, createdAfterDate };
