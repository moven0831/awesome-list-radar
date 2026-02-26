import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dedup, extractUrlsFromMarkdown } from "../../src/filter/dedup";
import type { RadarConfig } from "../../src/config";
import type { Candidate } from "../../src/sources/types";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

const sampleReadme = readFileSync(
  join(__dirname, "../fixtures/sample-readme.md"),
  "utf-8"
);

const baseConfig = {
  description: "test",
  list_file: "tests/fixtures/sample-readme.md",
  sources: {
    github: { topics: ["test"], min_stars: 0, created_after: "30d" },
  },
  classification: {
    model: "claude-sonnet-4-6",
    threshold: 70,
    max_issues_per_run: 5,
  },
  issue_template: { labels: ["radar"] },
} as RadarConfig;

const makeCand = (url: string): Candidate => ({
  url,
  title: "Test",
  description: "Test description",
  source: "github",
  metadata: {},
});

describe("extractUrlsFromMarkdown", () => {
  it("extracts all URLs from markdown", () => {
    const urls = extractUrlsFromMarkdown(sampleReadme);
    expect(urls.has("https://github.com/ingonyama-zk/icicle")).toBe(true);
    expect(urls.has("https://github.com/example/webgpu-msm")).toBe(true);
    expect(urls.has("https://arxiv.org/abs/2301.12345")).toBe(true);
    expect(urls.has("https://blog.example.com/gpu-proving")).toBe(true);
  });

  it("normalizes URLs to lowercase", () => {
    const urls = extractUrlsFromMarkdown(
      "[Test](https://GitHub.com/Foo/Bar)"
    );
    expect(urls.has("https://github.com/foo/bar")).toBe(true);
  });

  it("returns empty set for text with no URLs", () => {
    expect(extractUrlsFromMarkdown("no urls here")).toEqual(new Set());
  });
});

describe("dedup", () => {
  it("removes candidates whose URLs exist in the README", () => {
    const candidates = [
      makeCand("https://github.com/ingonyama-zk/icicle"),
      makeCand("https://github.com/new/repo"),
      makeCand("https://blog.example.com/gpu-proving"),
    ];

    const mockReadFile = vi.fn().mockReturnValue(sampleReadme);
    const result = dedup(candidates, baseConfig, mockReadFile as any);

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://github.com/new/repo");
  });

  it("handles case-insensitive URL matching", () => {
    const candidates = [
      makeCand("https://GitHub.com/Ingonyama-ZK/Icicle"),
    ];

    const mockReadFile = vi.fn().mockReturnValue(sampleReadme);
    const result = dedup(candidates, baseConfig, mockReadFile as any);

    expect(result).toHaveLength(0);
  });

  it("returns all candidates when list file cannot be read", () => {
    const candidates = [makeCand("https://example.com/test")];

    const mockReadFile = vi.fn().mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const result = dedup(candidates, baseConfig, mockReadFile as any);

    expect(result).toHaveLength(1);
  });

  it("returns all candidates when list file has no URLs", () => {
    const candidates = [makeCand("https://example.com/test")];

    const mockReadFile = vi.fn().mockReturnValue("# Empty list\n\nNo links here.");
    const result = dedup(candidates, baseConfig, mockReadFile as any);

    expect(result).toHaveLength(1);
  });
});
