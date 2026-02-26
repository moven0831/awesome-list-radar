import * as core from "@actions/core";
import Parser from "rss-parser";
import type { RadarConfig } from "../config.js";
import type { Candidate } from "./types.js";

const MAX_DESCRIPTION_LENGTH = 1000;

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

  const results = await Promise.allSettled(
    blogs.feeds.map(async (feedUrl) => {
      core.info(`Fetching feed: ${feedUrl}`);
      return { feedUrl, feed: await rssParser.parseURL(feedUrl) };
    })
  );

  const candidates: Candidate[] = [];

  for (const result of results) {
    if (result.status === "rejected") {
      core.warning(`Failed to fetch feed: ${result.reason}`);
      continue;
    }

    const { feed } = result.value;

    for (const item of feed.items) {
      if (!item.link || !item.title) continue;

      const text = `${item.title} ${item.contentSnippet ?? item.content ?? ""}`;

      if (blogs.keywords && blogs.keywords.length > 0) {
        if (!matchesKeywords(text, blogs.keywords)) continue;
      }

      candidates.push({
        url: item.link,
        title: item.title,
        description: (item.contentSnippet ?? item.content ?? "").slice(
          0,
          MAX_DESCRIPTION_LENGTH
        ),
        source: "blog",
        metadata: {
          authors: item.creator ? [item.creator] : undefined,
          publishedAt: item.isoDate ?? item.pubDate,
          feedName: feed.title,
        },
      });
    }
  }

  return candidates;
}

export { matchesKeywords };
