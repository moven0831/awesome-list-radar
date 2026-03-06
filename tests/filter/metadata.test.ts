import { describe, it, expect, vi } from "vitest";
import { filterByMetadata } from "../../src/filter/metadata";
import type { RadarConfig } from "../../src/config";
import type { Candidate } from "../../src/sources/types";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
}));

const baseConfig = {
  description: "test",
  list_file: "README.md",
  sources: {
    github: { topics: ["test"], min_stars: 0, created_after: "30d" },
  },
  filter: {
    exclude_forks: false,
    exclude_archived: false,
    require_license: false,
  },
  classification: {
    model: "claude-sonnet-4-6",
    threshold: 70,
    max_issues_per_run: 5,
  },
  issue_template: { labels: ["radar"] },
} as RadarConfig;

const makeCand = (overrides: Partial<Candidate> = {}): Candidate => ({
  url: "https://example.com/repo",
  title: "Test Repo",
  description: "A test repository",
  source: "github",
  metadata: {},
  ...overrides,
});

describe("filterByMetadata", () => {
  it("passes all candidates with default filter config", () => {
    const candidates = [makeCand(), makeCand()];
    const result = filterByMetadata(candidates, baseConfig);
    expect(result).toHaveLength(2);
  });

  it("filters out fork candidates when exclude_forks is true", () => {
    const config = {
      ...baseConfig,
      filter: { ...baseConfig.filter, exclude_forks: true },
    } as RadarConfig;

    const candidates = [
      makeCand({ metadata: { fork: true } }),
      makeCand({ metadata: { fork: false } }),
      makeCand({ metadata: {} }),
    ];

    const result = filterByMetadata(candidates, config);
    expect(result).toHaveLength(2);
    // First result is the non-fork, second is the one without fork field
    expect(result[0].metadata.fork).toBe(false);
    expect(result[1].metadata.fork).toBeUndefined();
  });

  it("filters out archived candidates when exclude_archived is true", () => {
    const config = {
      ...baseConfig,
      filter: { ...baseConfig.filter, exclude_archived: true },
    } as RadarConfig;

    const candidates = [
      makeCand({ metadata: { archived: true } }),
      makeCand({ metadata: { archived: false } }),
      makeCand({ metadata: {} }),
    ];

    const result = filterByMetadata(candidates, config);
    expect(result).toHaveLength(2);
  });

  it("filters out candidates without license when require_license is true", () => {
    const config = {
      ...baseConfig,
      filter: { ...baseConfig.filter, require_license: true },
    } as RadarConfig;

    const candidates = [
      makeCand({ metadata: { license: "MIT" } }),
      makeCand({ metadata: { license: "" } }),
      makeCand({ metadata: {} }),
    ];

    const result = filterByMetadata(candidates, config);
    expect(result).toHaveLength(1);
    expect(result[0].metadata.license).toBe("MIT");
  });

  it("filters out old candidates when max_age_days is set", () => {
    const config = {
      ...baseConfig,
      filter: { ...baseConfig.filter, max_age_days: 30 },
    } as RadarConfig;

    const recent = new Date();
    recent.setDate(recent.getDate() - 10);

    const old = new Date();
    old.setDate(old.getDate() - 60);

    const candidates = [
      makeCand({ metadata: { lastPushedAt: recent.toISOString() } }),
      makeCand({ metadata: { lastPushedAt: old.toISOString() } }),
      makeCand({ metadata: { publishedAt: recent.toISOString() } }),
      makeCand({ metadata: { publishedAt: old.toISOString() } }),
    ];

    const result = filterByMetadata(candidates, config);
    expect(result).toHaveLength(2);
  });

  it("prefers lastPushedAt over publishedAt for age check", () => {
    const config = {
      ...baseConfig,
      filter: { ...baseConfig.filter, max_age_days: 30 },
    } as RadarConfig;

    const recent = new Date();
    recent.setDate(recent.getDate() - 10);
    const old = new Date();
    old.setDate(old.getDate() - 60);

    const candidates = [
      makeCand({
        metadata: {
          lastPushedAt: recent.toISOString(),
          publishedAt: old.toISOString(),
        },
      }),
    ];

    const result = filterByMetadata(candidates, config);
    expect(result).toHaveLength(1);
  });

  it("candidates without date fields pass through max_age_days filter", () => {
    const config = {
      ...baseConfig,
      filter: { ...baseConfig.filter, max_age_days: 30 },
    } as RadarConfig;

    const candidates = [makeCand({ metadata: {} })];

    const result = filterByMetadata(candidates, config);
    expect(result).toHaveLength(1);
  });

  it("candidates without metadata fields pass through (no false positives)", () => {
    const config = {
      ...baseConfig,
      filter: {
        ...baseConfig.filter,
        exclude_forks: true,
        exclude_archived: true,
        require_license: false,
        max_age_days: 30,
      },
    } as RadarConfig;

    const candidates = [makeCand({ metadata: {} })];

    const result = filterByMetadata(candidates, config);
    expect(result).toHaveLength(1);
  });
});
