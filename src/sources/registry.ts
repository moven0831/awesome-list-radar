import * as core from "@actions/core";
import type { RadarConfig } from "../config";
import type { Candidate } from "./types";

interface RegistryEntry {
  type: "npm" | "pypi" | "crates";
  keywords: string[];
  min_downloads: number;
  max_results: number;
}

async function collectNpm(
  entry: RegistryEntry,
  fetchFn: typeof fetch
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  const query = entry.keywords.join(" ");
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${entry.max_results}`;

  const response = await fetchFn(url);
  if (!response.ok) {
    core.warning(`npm search failed: HTTP ${response.status}`);
    return [];
  }

  if (entry.min_downloads > 0) {
    core.warning(
      `min_downloads is not supported for npm (search API lacks download counts) and will be ignored`
    );
  }

  const data = (await response.json()) as any;
  for (const result of data.objects ?? []) {
    const pkg = result.package;

    candidates.push({
      url: `https://www.npmjs.com/package/${pkg.name}`,
      title: pkg.name,
      description: (pkg.description ?? "").slice(0, 1000),
      source: "registry",
      metadata: {
        language: "JavaScript",
        publishedAt: pkg.date,
      },
    });
  }

  return candidates;
}

async function collectPyPI(
  entry: RegistryEntry,
  fetchFn: typeof fetch
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  if (entry.min_downloads > 0) {
    core.warning(
      `min_downloads is not supported for PyPI and will be ignored`
    );
  }

  for (const keyword of entry.keywords) {
    const url = `https://pypi.org/pypi/${encodeURIComponent(keyword)}/json`;
    try {
      const response = await fetchFn(url);
      if (!response.ok) continue;

      const data = (await response.json()) as any;
      const info = data.info;
      if (!info) continue;

      candidates.push({
        url: `https://pypi.org/project/${info.name}/`,
        title: info.name,
        description: (info.summary ?? "").slice(0, 1000),
        source: "registry",
        metadata: {
          language: "Python",
          publishedAt: data.urls?.[0]?.upload_time_iso_8601,
        },
      });
    } catch {
      core.warning(`PyPI lookup failed for "${keyword}"`);
    }
  }

  return candidates;
}

async function collectCrates(
  entry: RegistryEntry,
  fetchFn: typeof fetch
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  const query = entry.keywords.join(" ");
  const url = `https://crates.io/api/v1/crates?q=${encodeURIComponent(query)}&per_page=${entry.max_results}&sort=downloads`;

  const response = await fetchFn(url, {
    headers: {
      "User-Agent":
        "awesome-list-radar (https://github.com/moven0831/awesome-list-radar)",
    },
  });
  if (!response.ok) {
    core.warning(`crates.io search failed: HTTP ${response.status}`);
    return [];
  }

  const data = (await response.json()) as any;
  for (const crate of data.crates ?? []) {
    if (
      entry.min_downloads > 0 &&
      (crate.downloads ?? 0) < entry.min_downloads
    ) {
      continue;
    }

    candidates.push({
      url: `https://crates.io/crates/${crate.name}`,
      title: crate.name,
      description: (crate.description ?? "").slice(0, 1000),
      source: "registry",
      metadata: {
        language: "Rust",
        publishedAt: crate.updated_at,
      },
    });
  }

  return candidates;
}

export async function collectRegistries(
  config: RadarConfig,
  fetchFn: typeof fetch = fetch
): Promise<Candidate[]> {
  if (!config.sources.registries) return [];

  const candidates: Candidate[] = [];

  for (const entry of config.sources.registries) {
    try {
      let results: Candidate[];
      switch (entry.type) {
        case "npm":
          results = await collectNpm(entry, fetchFn);
          break;
        case "pypi":
          results = await collectPyPI(entry, fetchFn);
          break;
        case "crates":
          results = await collectCrates(entry, fetchFn);
          break;
      }
      core.info(`Registry ${entry.type}: found ${results.length} candidates`);
      candidates.push(...results);
    } catch (error) {
      core.warning(
        `Registry ${entry.type} collection failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return candidates;
}
