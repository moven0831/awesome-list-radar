import { describe, it, expect, vi } from "vitest";
import {
  filterCandidates,
  getAllKeywords,
  matchesAnyKeyword,
} from "../../src/filter/keywords";
import type { RadarConfig } from "../../src/config";
import type { Candidate } from "../../src/sources/types";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
}));

const baseConfig = {
  description: "test",
  list_file: "README.md",
  sources: {
    github: {
      topics: ["webgpu", "gpu-crypto"],
      min_stars: 0,
      created_after: "30d",
    },
    arxiv: {
      categories: ["cs.CR"],
      keywords: ["MSM", "zero-knowledge"],
    },
  },
  classification: {
    model: "claude-sonnet-4-6",
    threshold: 70,
    max_issues_per_run: 5,
  },
  issue_template: { labels: ["radar"] },
} as RadarConfig;

const makeCand = (title: string, desc: string, topics?: string[]): Candidate => ({
  url: `https://example.com/${title.replace(/\s+/g, "-")}`,
  title,
  description: desc,
  source: "github",
  metadata: { topics },
});

describe("getAllKeywords", () => {
  it("collects and deduplicates keywords from all sources", () => {
    const kws = getAllKeywords(baseConfig);
    expect(kws).toContain("webgpu");
    expect(kws).toContain("gpu-crypto");
    expect(kws).toContain("msm");
    expect(kws).toContain("zero-knowledge");
    // All lowercase
    expect(kws.every((kw) => kw === kw.toLowerCase())).toBe(true);
  });

  it("returns empty array when no sources configured", () => {
    const config = { ...baseConfig, sources: {} } as RadarConfig;
    expect(getAllKeywords(config)).toEqual([]);
  });
});

describe("matchesAnyKeyword", () => {
  it("matches case-insensitively", () => {
    expect(matchesAnyKeyword("WebGPU library", ["webgpu"])).toBe(true);
  });

  it("returns false when no match", () => {
    expect(matchesAnyKeyword("unrelated text", ["webgpu", "msm"])).toBe(false);
  });
});

describe("filterCandidates", () => {
  it("keeps candidates matching any keyword in title, description, or topics", () => {
    const candidates = [
      makeCand("GPU MSM Library", "A fast MSM implementation"),
      makeCand("WebGPU Renderer", "3D rendering with WebGPU", ["webgpu"]),
      makeCand("Recipe App", "Cook delicious meals"),
      makeCand("ZK Toolkit", "zero-knowledge proof tools"),
    ];

    const filtered = filterCandidates(candidates, baseConfig);
    expect(filtered).toHaveLength(3);
    expect(filtered.map((c) => c.title)).toEqual([
      "GPU MSM Library",
      "WebGPU Renderer",
      "ZK Toolkit",
    ]);
  });

  it("passes all candidates through when no keywords configured", () => {
    const config = { ...baseConfig, sources: {} } as RadarConfig;
    const candidates = [makeCand("Anything", "Goes through")];
    expect(filterCandidates(candidates, config)).toHaveLength(1);
  });

  it("matches keywords in topic metadata", () => {
    const candidates = [
      makeCand("Generic Name", "Generic description", ["gpu-crypto"]),
    ];

    const filtered = filterCandidates(candidates, baseConfig);
    expect(filtered).toHaveLength(1);
  });
});
