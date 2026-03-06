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

function matchesAllKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.every((kw) => lower.includes(kw));
}

function getSearchText(c: Candidate): string {
  return `${c.title} ${c.description} ${c.metadata.topics?.join(" ") ?? ""}`;
}

export function filterCandidates(
  candidates: Candidate[],
  config: RadarConfig
): Candidate[] {
  // Determine include keywords: prefer filter.include, fall back to source keywords
  const includeKeywords =
    config.filter?.include?.map((kw) => kw.toLowerCase()) ??
    getAllKeywords(config);
  const requireAllKeywords = (config.filter?.require_all ?? []).map((kw) => kw.toLowerCase());
  const excludeKeywords =
    config.filter?.exclude?.map((kw) => kw.toLowerCase()) ?? [];

  let filtered = candidates;

  // Step 1: include (OR match)
  if (includeKeywords.length > 0) {
    filtered = filtered.filter((c) => {
      const searchText = getSearchText(c);
      return matchesAnyKeyword(searchText, includeKeywords);
    });
    core.info(
      `Include filter: ${candidates.length} → ${filtered.length} candidates`
    );
  } else {
    core.info("No keywords configured, passing all candidates through");
  }

  // Step 2: require_all (AND match)
  if (requireAllKeywords.length > 0) {
    const before = filtered.length;
    filtered = filtered.filter((c) => {
      const searchText = getSearchText(c);
      return matchesAllKeywords(searchText, requireAllKeywords);
    });
    core.info(
      `Require-all filter: ${before} → ${filtered.length} candidates`
    );
  }

  // Step 3: exclude (NOT match)
  if (excludeKeywords.length > 0) {
    const before = filtered.length;
    filtered = filtered.filter((c) => {
      const searchText = getSearchText(c);
      return !matchesAnyKeyword(searchText, excludeKeywords);
    });
    core.info(`Exclude filter: ${before} → ${filtered.length} candidates`);
  }

  return filtered;
}

export { getAllKeywords, matchesAnyKeyword, matchesAllKeywords };
