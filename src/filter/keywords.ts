import * as core from "@actions/core";
import type { RadarConfig } from "../config";
import type { Candidate } from "../sources/types";

function getAllKeywords(config: RadarConfig): string[] {
  const keywords: string[] = [];

  if (config.sources.github?.topics) {
    keywords.push(...config.sources.github.topics);
  }
  if (config.sources.arxiv?.keywords) {
    keywords.push(...config.sources.arxiv.keywords);
  }
  if (config.sources.blogs?.keywords) {
    keywords.push(...config.sources.blogs.keywords);
  }
  if (config.sources.web_pages?.keywords) {
    keywords.push(...config.sources.web_pages.keywords);
  }

  return [...new Set(keywords.map((kw) => kw.toLowerCase()))];
}

function matchesAnyKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export function filterCandidates(
  candidates: Candidate[],
  config: RadarConfig
): Candidate[] {
  const keywords = getAllKeywords(config);

  if (keywords.length === 0) {
    core.info("No keywords configured, passing all candidates through");
    return candidates;
  }

  const filtered = candidates.filter((c) => {
    const searchText = `${c.title} ${c.description} ${c.metadata.topics?.join(" ") ?? ""}`;
    return matchesAnyKeyword(searchText, keywords);
  });

  core.info(
    `Keyword filter: ${candidates.length} → ${filtered.length} candidates`
  );
  return filtered;
}

export { getAllKeywords, matchesAnyKeyword };
