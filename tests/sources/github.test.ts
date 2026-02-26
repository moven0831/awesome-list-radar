import { describe, it, expect, vi } from "vitest";
import {
  collectGitHub,
  buildSearchQuery,
  createdAfterDate,
} from "../../src/sources/github.js";
import type { RadarConfig } from "../../src/config.js";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
  getInput: vi.fn(() => "fake-token"),
}));

const baseConfig = {
  description: "test",
  list_file: "README.md",
  sources: {
    github: {
      topics: ["webgpu", "gpu-crypto"],
      languages: ["rust", "cuda"],
      min_stars: 5,
      created_after: "30d",
    },
  },
  classification: {
    model: "claude-sonnet-4-6",
    threshold: 70,
    max_issues_per_run: 5,
  },
  issue_template: { labels: ["radar"] },
} as RadarConfig;

describe("createdAfterDate", () => {
  it("returns a date N days ago in YYYY-MM-DD format", () => {
    const result = createdAfterDate("30d");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const expected = new Date();
    expected.setDate(expected.getDate() - 30);
    expect(result).toBe(expected.toISOString().split("T")[0]);
  });
});

describe("buildSearchQuery", () => {
  it("includes topics, languages, stars, and created date", () => {
    const query = buildSearchQuery(baseConfig);

    expect(query).toContain("topic:webgpu");
    expect(query).toContain("topic:gpu-crypto");
    expect(query).toContain("language:rust");
    expect(query).toContain("language:cuda");
    expect(query).toContain("stars:>=5");
    expect(query).toContain("created:>=");
  });

  it("omits stars filter when min_stars is 0", () => {
    const config = {
      ...baseConfig,
      sources: {
        github: { ...baseConfig.sources.github!, min_stars: 0 },
      },
    } as RadarConfig;

    const query = buildSearchQuery(config);
    expect(query).not.toContain("stars:");
  });

  it("omits languages when not specified", () => {
    const config = {
      ...baseConfig,
      sources: {
        github: {
          topics: ["test"],
          min_stars: 0,
          created_after: "30d",
        },
      },
    } as RadarConfig;

    const query = buildSearchQuery(config);
    expect(query).not.toContain("language:");
  });
});

describe("collectGitHub", () => {
  it("maps API response to Candidate objects", async () => {
    const mockOctokit = {
      search: {
        repos: vi.fn().mockResolvedValue({
          data: {
            items: [
              {
                html_url: "https://github.com/test/repo1",
                full_name: "test/repo1",
                description: "A GPU crypto library",
                stargazers_count: 42,
                language: "Rust",
                topics: ["webgpu", "crypto"],
              },
              {
                html_url: "https://github.com/test/repo2",
                full_name: "test/repo2",
                description: null,
                stargazers_count: 10,
                language: null,
                topics: [],
              },
            ],
          },
        }),
      },
    } as any;

    const candidates = await collectGitHub(baseConfig, mockOctokit);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({
      url: "https://github.com/test/repo1",
      title: "test/repo1",
      description: "A GPU crypto library",
      source: "github",
      metadata: {
        stars: 42,
        language: "Rust",
        topics: ["webgpu", "crypto"],
      },
    });
    expect(candidates[1].description).toBe("");
    expect(candidates[1].metadata.language).toBeUndefined();
  });

  it("returns empty array when github source is not configured", async () => {
    const config = {
      ...baseConfig,
      sources: {},
    } as RadarConfig;

    const candidates = await collectGitHub(config);
    expect(candidates).toEqual([]);
  });

  it("handles API errors gracefully", async () => {
    const mockOctokit = {
      search: {
        repos: vi.fn().mockRejectedValue(new Error("rate limited")),
      },
    } as any;

    const candidates = await collectGitHub(baseConfig, mockOctokit);
    expect(candidates).toEqual([]);
  });
});
