import { readFileSync } from "node:fs";
import * as core from "@actions/core";
import type { RadarConfig } from "../config";
import type { Candidate } from "../sources/types";

const URL_REGEX = /https?:\/\/[^\s\)>\]]+/g;

export function normalizeUrl(url: string): string {
  let normalized = url.toLowerCase();
  // Remove protocol
  normalized = normalized.replace(/^https?:\/\//, "");
  // Remove www.
  normalized = normalized.replace(/^www\./, "");
  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, "");
  // Remove tracking params
  try {
    const parsed = new URL("https://" + normalized);
    const paramsToRemove = [...parsed.searchParams.keys()].filter(
      (k) => k.startsWith("utm_") || k === "ref" || k === "source"
    );
    paramsToRemove.forEach((k) => parsed.searchParams.delete(k));
    // Reconstruct without protocol
    normalized = parsed.hostname + parsed.pathname + parsed.search;
    normalized = normalized.replace(/\/+$/, "");
  } catch {
    // If URL parsing fails, just use the lowercase version
  }
  return normalized;
}

export function extractUrlsFromMarkdown(markdown: string): Set<string> {
  const urls = new Set<string>();
  const matches = markdown.match(URL_REGEX);
  if (matches) {
    for (const url of matches) {
      // Remove trailing punctuation before normalizing
      const cleaned = url.replace(/[.,;:!?]+$/, "");
      urls.add(normalizeUrl(cleaned));
    }
  }
  return urls;
}

type ReadFileFn = (path: string, encoding: BufferEncoding) => string;

export function dedup(
  candidates: Candidate[],
  config: RadarConfig,
  readFileFn: ReadFileFn = readFileSync as ReadFileFn
): Candidate[] {
  let existingUrls: Set<string>;

  try {
    const markdown = readFileFn(config.list_file, "utf-8");
    existingUrls = extractUrlsFromMarkdown(markdown);
  } catch {
    core.warning(
      `Could not read list file "${config.list_file}", skipping dedup`
    );
    return candidates;
  }

  const filtered = candidates.filter(
    (c) => !existingUrls.has(normalizeUrl(c.url))
  );

  core.info(
    `Dedup: ${candidates.length} → ${filtered.length} candidates (${existingUrls.size} existing URLs)`
  );
  return filtered;
}
