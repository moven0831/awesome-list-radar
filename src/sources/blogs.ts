import * as core from "@actions/core";
import Parser from "rss-parser";
import type { RadarConfig } from "../config.js";
import type { Candidate } from "./types.js";

function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

export async function collectBlogs(
  config: RadarConfig,
  parser?: Parser
): Promise<Candidate[]> {
  if (!config.sources.blogs) return [];

  const rssParser = parser ?? new Parser();
  const blogs = config.sources.blogs;
  const candidates: Candidate[] = [];

  for (const feedUrl of blogs.feeds) {
    try {
      core.info(`Fetching feed: ${feedUrl}`);
      const feed = await rssParser.parseURL(feedUrl);

      for (const item of feed.items) {
        if (!item.link || !item.title) continue;

        const text = `${item.title} ${item.contentSnippet ?? item.content ?? ""}`;

        if (blogs.keywords && blogs.keywords.length > 0) {
          if (!matchesKeywords(text, blogs.keywords)) continue;
        }

        candidates.push({
          url: item.link,
          title: item.title,
          description: item.contentSnippet ?? item.content ?? "",
          source: "blog",
          metadata: {
            authors: item.creator ? [item.creator] : undefined,
            publishedAt: item.isoDate ?? item.pubDate,
            feedName: feed.title,
          },
        });
      }
    } catch (error) {
      core.warning(
        `Failed to fetch feed ${feedUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return candidates;
}

export { matchesKeywords };
