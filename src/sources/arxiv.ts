import * as core from "@actions/core";
import { XMLParser } from "fast-xml-parser";
import type { RadarConfig } from "../config";
import type { Candidate } from "./types";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const MAX_DESCRIPTION_LENGTH = 1000;

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  author: { name: string } | { name: string }[];
  published: string;
}

function buildArxivQuery(config: RadarConfig): string {
  const arxiv = config.sources.arxiv!;
  const catParts = arxiv.categories.map((c) => `cat:${c}`);
  const catQuery =
    catParts.length > 1 ? `(${catParts.join(" OR ")})` : catParts[0];

  const kwParts = arxiv.keywords.map((kw) => `all:"${kw}"`);
  const kwQuery =
    kwParts.length > 1 ? `(${kwParts.join(" OR ")})` : kwParts[0];

  return `${catQuery} AND ${kwQuery}`;
}

function buildArxivUrl(query: string): string {
  const url = new URL(ARXIV_API_URL);
  url.searchParams.set("search_query", query);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", "50");
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");
  return url.toString();
}

function parseAuthors(
  author: { name: string } | { name: string }[]
): string[] {
  if (Array.isArray(author)) {
    return author.map((a) => a.name);
  }
  return [author.name];
}

export async function collectArxiv(
  config: RadarConfig,
  fetchFn: typeof fetch = fetch
): Promise<Candidate[]> {
  if (!config.sources.arxiv) return [];

  const query = buildArxivQuery(config);
  const url = buildArxivUrl(query);

  core.info(`arXiv query URL: ${url}`);

  try {
    const response = await fetchFn(url);
    if (!response.ok) {
      core.warning(`arXiv API returned ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
    });
    const parsed = parser.parse(xml);

    const feed = parsed.feed;
    if (!feed?.entry) return [];

    const entries: ArxivEntry[] = Array.isArray(feed.entry)
      ? feed.entry
      : [feed.entry];

    return entries.map((entry) => ({
      url: typeof entry.id === "string" ? entry.id : String(entry.id),
      title: String(entry.title).replace(/\s+/g, " ").trim(),
      description: String(entry.summary)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_DESCRIPTION_LENGTH),
      source: "arxiv" as const,
      metadata: {
        authors: parseAuthors(entry.author),
        publishedAt: entry.published,
      },
    }));
  } catch (error) {
    core.warning(
      `arXiv collection failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return [];
  }
}

export { buildArxivQuery, buildArxivUrl };
