import { describe, it, expect, vi } from "vitest";
import {
  collectGitHub,
  buildSearchQuery,
  createdAfterDate,
} from "../../src/sources/github";
import type { RadarConfig } from "../../src/config";

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
      max_results: 100,
      sort: "stars",
      exclude_forks: false,
      exclude_archived: false,
    },
  },
  classification: {
    model: "claude-sonnet-4-6",
    threshold: 70,
    max_classifications_per_run: 5,
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

  it("handles 0d (today)", () => {
    const result = createdAfterDate("0d");
    expect(result).toBe(new Date().toISOString().split("T")[0]);
  });

  it("throws on invalid spec", () => {
    expect(() => createdAfterDate("d")).toThrow("Invalid date spec");
    expect(() => createdAfterDate("abc")).toThrow("Invalid date spec");
  });
});

describe("buildSearchQuery", () => {
  it("includes topics with OR semantics, languages, stars, and created date", () => {
    const query = buildSearchQuery(baseConfig.sources.github!.topics, baseConfig);

    expect(query).toContain("topic:webgpu topic:gpu-crypto");
    expect(query).toContain("language:rust language:cuda");
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

    const query = buildSearchQuery(config.sources.github!.topics, config);
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
          max_results: 100,
          sort: "stars" as const,
          exclude_forks: false,
          exclude_archived: false,
        },
      },
    } as RadarConfig;

    const query = buildSearchQuery(config.sources.github!.topics, config);
    expect(query).not.toContain("language:");
  });

  it("appends fork:false when exclude_forks is true", () => {
    const config = {
      ...baseConfig,
      sources: {
        github: { ...baseConfig.sources.github!, exclude_forks: true },
      },
    } as RadarConfig;

    const query = buildSearchQuery(config.sources.github!.topics, config);
    expect(query).toContain("fork:false");
  });

  it("appends archived:false when exclude_archived is true", () => {
    const config = {
      ...baseConfig,
      sources: {
        github: { ...baseConfig.sources.github!, exclude_archived: true },
      },
    } as RadarConfig;

    const query = buildSearchQuery(config.sources.github!.topics, config);
    expect(query).toContain("archived:false");
  });

  it("includes fork:true by default to include forks in results", () => {
    const query = buildSearchQuery(baseConfig.sources.github!.topics, baseConfig);
    expect(query).toContain("fork:true");
    expect(query).not.toContain("archived:");
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
                license: { spdx_id: "MIT" },
                archived: false,
                fork: false,
                owner: { login: "test" },
                homepage: "https://example.com",
                pushed_at: "2025-01-15T00:00:00Z",
              },
              {
                html_url: "https://github.com/test/repo2",
                full_name: "test/repo2",
                description: null,
                stargazers_count: 10,
                language: null,
                topics: [],
                license: null,
                archived: false,
                fork: true,
                owner: { login: "test" },
                homepage: "",
                pushed_at: "2025-01-10T00:00:00Z",
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
        license: "MIT",
        archived: false,
        fork: false,
        owner: "test",
        homepage: "https://example.com",
        lastPushedAt: "2025-01-15T00:00:00Z",
      },
    });
    expect(candidates[1].description).toBe("");
    expect(candidates[1].metadata.language).toBeUndefined();
    expect(candidates[1].metadata.license).toBeUndefined();
    expect(candidates[1].metadata.homepage).toBeUndefined();
    expect(candidates[1].metadata.fork).toBe(true);
    expect(candidates[1].metadata.owner).toBe("test");
    expect(candidates[1].metadata.archived).toBe(false);
    expect(candidates[1].metadata.lastPushedAt).toBe("2025-01-10T00:00:00Z");
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

  it("paginates to fetch multiple pages up to max_results", async () => {
    const makeItems = (count: number, offset: number = 0) =>
      Array.from({ length: count }, (_, i) => ({
        html_url: `https://github.com/test/repo${offset + i}`,
        full_name: `test/repo${offset + i}`,
        description: `Repo ${offset + i}`,
        stargazers_count: 100 - offset - i,
        language: "Rust",
        topics: ["test"],
      }));

    const mockOctokit = {
      search: {
        repos: vi
          .fn()
          .mockResolvedValueOnce({ data: { items: makeItems(100, 0) } })
          .mockResolvedValueOnce({ data: { items: makeItems(50, 100) } }),
      },
    } as any;

    const config = {
      ...baseConfig,
      sources: {
        github: { ...baseConfig.sources.github!, max_results: 200 },
      },
    } as RadarConfig;

    const candidates = await collectGitHub(config, mockOctokit);
    expect(candidates).toHaveLength(150);
    expect(mockOctokit.search.repos).toHaveBeenCalledTimes(2);
  });

  it("caps results at max_results even when API returns more", async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      html_url: `https://github.com/test/repo${i}`,
      full_name: `test/repo${i}`,
      description: `Repo ${i}`,
      stargazers_count: 100 - i,
      language: "Rust",
      topics: ["test"],
    }));

    const mockOctokit = {
      search: {
        repos: vi.fn().mockResolvedValue({ data: { items } }),
      },
    } as any;

    const config = {
      ...baseConfig,
      sources: {
        github: { ...baseConfig.sources.github!, max_results: 50 },
      },
    } as RadarConfig;

    const candidates = await collectGitHub(config, mockOctokit);
    expect(candidates).toHaveLength(50);
  });

  it("passes sort parameter correctly to API", async () => {
    const mockOctokit = {
      search: {
        repos: vi.fn().mockResolvedValue({ data: { items: [] } }),
      },
    } as any;

    const config = {
      ...baseConfig,
      sources: {
        github: { ...baseConfig.sources.github!, sort: "updated" as const },
      },
    } as RadarConfig;

    await collectGitHub(config, mockOctokit);
    expect(mockOctokit.search.repos).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "updated" })
    );
  });

  it("passes undefined sort for best-match", async () => {
    const mockOctokit = {
      search: {
        repos: vi.fn().mockResolvedValue({ data: { items: [] } }),
      },
    } as any;

    const config = {
      ...baseConfig,
      sources: {
        github: { ...baseConfig.sources.github!, sort: "best-match" as const },
      },
    } as RadarConfig;

    await collectGitHub(config, mockOctokit);
    expect(mockOctokit.search.repos).toHaveBeenCalledWith(
      expect.objectContaining({ sort: undefined })
    );
  });
});
