import { describe, it, expect, vi } from "vitest";
import {
  filterCandidates,
  getAllKeywords,
  matchesAnyKeyword,
  matchesAllKeywords,
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
  filter: {
    exclude_forks: false,
    exclude_archived: false,
    require_license: false,
  },
  classification: {
    model: "claude-sonnet-4-6",
    threshold: 70,
    max_classifications_per_run: 5,
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

  it("includes web_pages keywords", () => {
    const config = {
      ...baseConfig,
      sources: {
        ...baseConfig.sources,
        web_pages: {
          urls: ["https://example.com/blog"],
          keywords: ["Metal GPU", "client-side"],
        },
      },
    } as RadarConfig;
    const kws = getAllKeywords(config);
    expect(kws).toContain("metal gpu");
    expect(kws).toContain("client-side");
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

describe("matchesAllKeywords", () => {
  it("returns true when all keywords present", () => {
    expect(matchesAllKeywords("WebGPU MSM library", ["webgpu", "msm"])).toBe(true);
  });

  it("returns false when some keywords missing", () => {
    expect(matchesAllKeywords("WebGPU library", ["webgpu", "msm"])).toBe(false);
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

  it("uses filter.include keywords when specified (OR mode)", () => {
    const config = {
      ...baseConfig,
      filter: {
        ...baseConfig.filter,
        include: ["rust", "wasm"],
      },
    } as RadarConfig;

    const candidates = [
      makeCand("Rust GPU", "GPU computing in Rust"),
      makeCand("WASM Runtime", "WebAssembly runtime"),
      makeCand("Python ML", "Machine learning in Python"),
    ];

    const filtered = filterCandidates(candidates, config);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((c) => c.title)).toEqual(["Rust GPU", "WASM Runtime"]);
  });

  it("applies require_all (AND mode)", () => {
    const config = {
      ...baseConfig,
      filter: {
        ...baseConfig.filter,
        require_all: ["gpu", "rust"],
      },
    } as RadarConfig;

    const candidates = [
      makeCand("Rust GPU Lib", "GPU computing in Rust"),
      makeCand("GPU Toolkit", "GPU computing tools"),
      makeCand("Rust Web", "Web framework in Rust"),
    ];

    // All pass include (source keywords don't match these, but require_all applies after include)
    // First, include filter with source keywords: "webgpu", "gpu-crypto", "msm", "zero-knowledge"
    // "Rust GPU Lib" has "gpu" which doesn't match source keywords exactly
    // Let's use filter.include to make this clearer
    const configWithInclude = {
      ...baseConfig,
      filter: {
        ...baseConfig.filter,
        include: ["gpu", "rust"],
        require_all: ["gpu", "rust"],
      },
    } as RadarConfig;

    const filtered = filterCandidates(candidates, configWithInclude);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Rust GPU Lib");
  });

  it("applies exclude (NOT mode)", () => {
    const config = {
      ...baseConfig,
      filter: {
        ...baseConfig.filter,
        include: ["gpu", "webgpu"],
        exclude: ["deprecated"],
      },
    } as RadarConfig;

    const candidates = [
      makeCand("GPU Lib", "A great GPU library"),
      makeCand("WebGPU Old", "Deprecated WebGPU project"),
      makeCand("GPU Tools", "Useful GPU utilities"),
    ];

    const filtered = filterCandidates(candidates, config);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((c) => c.title)).toEqual(["GPU Lib", "GPU Tools"]);
  });

  it("combines include + require_all + exclude", () => {
    const config = {
      ...baseConfig,
      filter: {
        ...baseConfig.filter,
        include: ["gpu", "cuda"],
        require_all: ["gpu"],
        exclude: ["toy"],
      },
    } as RadarConfig;

    const candidates = [
      makeCand("GPU CUDA Toolkit", "Fast GPU CUDA computing"),
      makeCand("GPU Toy Project", "A toy GPU demo"),
      makeCand("CUDA Compiler", "Compiles CUDA code"),
    ];

    const filtered = filterCandidates(candidates, config);
    // include: "GPU CUDA Toolkit" (gpu), "GPU Toy Project" (gpu), "CUDA Compiler" (cuda) → all 3
    // require_all ["gpu"]: "GPU CUDA Toolkit", "GPU Toy Project" → 2
    // exclude ["toy"]: "GPU CUDA Toolkit" → 1
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("GPU CUDA Toolkit");
  });

  it("backward compat: no filter.include falls back to source keywords", () => {
    // baseConfig has no filter.include, so it should use source keywords
    const candidates = [
      makeCand("WebGPU Renderer", "3D rendering"),
      makeCand("Unrelated App", "Nothing to do with topics"),
    ];

    const filtered = filterCandidates(candidates, baseConfig);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("WebGPU Renderer");
  });
});
