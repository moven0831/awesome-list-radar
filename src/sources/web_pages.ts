import Anthropic from "@anthropic-ai/sdk";
import * as core from "@actions/core";
import type { RadarConfig } from "../config";
import type { Candidate } from "./types";
import { matchesKeywords } from "./blogs";

const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_HTML_LENGTH = 15_000;

const SYSTEM_PROMPT = `You are an article link extractor. Given the cleaned text of a web page, extract all article or blog post links you can find.

Respond with ONLY a valid JSON array of objects, each with "title" and "url" fields:
[{"title": "Article Title", "url": "https://example.com/article"}]

If no article links are found, respond with an empty array: []`;

export function cleanHtml(html: string): string {
  let text = html;

  // Remove script, style, nav, footer, header tags and their content
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, "");

  // Convert <a href="url">text</a> to [text](url)
  text = text.replace(
    /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, url, linkText) => {
      const clean = linkText.replace(/<[^>]+>/g, "").trim();
      return clean ? `[${clean}](${url})` : "";
    }
  );

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text.slice(0, MAX_HTML_LENGTH);
}

export function extractFirstJsonArray(text: string): Array<{ title: string; url: string }> {
  const start = text.indexOf("[");
  if (start === -1) return [];
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[") depth++;
    if (text[i] === "]") depth--;
    if (depth === 0) {
      const parsed = JSON.parse(text.slice(start, i + 1));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          "title" in item &&
          "url" in item &&
          typeof (item as { title: unknown }).title === "string" &&
          typeof (item as { url: unknown }).url === "string"
      );
    }
  }
  return [];
}

export function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

export async function collectWebPages(
  config: RadarConfig,
  fetchFn?: typeof fetch,
  client?: Anthropic
): Promise<Candidate[]> {
  if (!config.sources.web_pages) return [];

  const webPages = config.sources.web_pages;
  const fetcher = fetchFn ?? fetch;
  const anthropic =
    client ?? new Anthropic({ apiKey: core.getInput("anthropic_api_key") });

  const results = await Promise.allSettled(
    webPages.urls.map(async (pageUrl) => {
      core.info(`Fetching web page: ${pageUrl}`);

      const response = await fetcher(pageUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${pageUrl}`);
      }
      const html = await response.text();
      const cleaned = cleanHtml(html);

      core.info(`Extracting links from ${pageUrl} (${cleaned.length} chars)`);

      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Extract all article/blog post links from this web page content:\n\n${cleaned}`,
          },
        ],
      });

      const text =
        message.content[0].type === "text" ? message.content[0].text : "[]";
      const links = extractFirstJsonArray(text);

      // Resolve relative URLs
      const resolved = links.map((link) => ({
        ...link,
        url: resolveUrl(pageUrl, link.url),
      }));

      return { pageUrl, links: resolved };
    })
  );

  const candidates: Candidate[] = [];

  for (const result of results) {
    if (result.status === "rejected") {
      core.warning(`Failed to process web page: ${result.reason}`);
      continue;
    }

    const { pageUrl, links } = result.value;

    for (const link of links) {
      if (!link.url || !link.title) continue;

      const text = `${link.title} ${link.url}`;

      // Optional keyword filtering
      if (webPages.keywords && webPages.keywords.length > 0) {
        if (!matchesKeywords(text, webPages.keywords)) continue;
      }

      candidates.push({
        url: link.url,
        title: link.title,
        description: link.title.slice(0, MAX_DESCRIPTION_LENGTH),
        source: "web_page",
        metadata: {
          pageName: new URL(pageUrl).hostname,
        },
      });
    }
  }

  return candidates;
}
