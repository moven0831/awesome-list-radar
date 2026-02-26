import { readFileSync } from "node:fs";
import * as core from "@actions/core";
import type { RadarConfig } from "../config.js";
import type { Candidate } from "../sources/types.js";

const URL_REGEX = /https?:\/\/[^\s\)>\]]+/g;

export function extractUrlsFromMarkdown(markdown: string): Set<string> {
  const urls = new Set<string>();
  const matches = markdown.match(URL_REGEX);
  if (matches) {
    for (const url of matches) {
      // Normalize: remove trailing punctuation, lowercase
      const cleaned = url.replace(/[.,;:!?]+$/, "").toLowerCase();
      urls.add(cleaned);
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
    (c) => !existingUrls.has(c.url.toLowerCase())
  );

  core.info(
    `Dedup: ${candidates.length} → ${filtered.length} candidates (${existingUrls.size} existing URLs)`
  );
  return filtered;
}
