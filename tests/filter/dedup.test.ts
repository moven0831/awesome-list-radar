import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  dedup,
  extractUrlsFromMarkdown,
  normalizeUrl,
} from "../../src/filter/dedup";
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

const makeCand = (url: string): Candidate => ({
  url,
  title: "Test",
  description: "Test description",
  source: "github",
  metadata: {},
});

describe("normalizeUrl", () => {
  it("strips http protocol", () => {
    expect(normalizeUrl("http://example.com/path")).toBe("example.com/path");
  });

  it("strips https protocol", () => {
    expect(normalizeUrl("https://example.com/path")).toBe("example.com/path");
  });

  it("strips www prefix", () => {
    expect(normalizeUrl("https://www.example.com/path")).toBe(
      "example.com/path"
    );
  });

  it("strips trailing slash", () => {
    expect(normalizeUrl("https://example.com/path/")).toBe(
      "example.com/path"
    );
  });

  it("removes utm tracking params", () => {
    expect(
      normalizeUrl("https://example.com/page?utm_source=twitter&utm_medium=social")
    ).toBe("example.com/page");
  });

  it("removes ref and source params", () => {
    expect(
      normalizeUrl("https://example.com/page?ref=homepage&source=nav")
    ).toBe("example.com/page");
  });

  it("preserves non-tracking query params", () => {
    expect(
      normalizeUrl("https://example.com/search?q=test&page=2")
    ).toBe("example.com/search?q=test&page=2");
  });

  it("removes tracking params but keeps others", () => {
    expect(
      normalizeUrl("https://example.com/page?q=test&utm_source=twitter")
    ).toBe("example.com/page?q=test");
  });

  it("lowercases the URL", () => {
    expect(normalizeUrl("https://GitHub.com/Foo/Bar")).toBe(
      "github.com/foo/bar"
    );
  });

  it("handles URLs without protocol gracefully", () => {
    const result = normalizeUrl("example.com/path");
    expect(result).toBe("example.com/path");
  });
});

describe("extractUrlsFromMarkdown", () => {
  it("extracts all URLs from markdown", () => {
    const urls = extractUrlsFromMarkdown(sampleReadme);
    expect(urls.has(normalizeUrl("https://github.com/ingonyama-zk/icicle"))).toBe(true);
    expect(urls.has(normalizeUrl("https://github.com/example/webgpu-msm"))).toBe(true);
    expect(urls.has(normalizeUrl("https://arxiv.org/abs/2301.12345"))).toBe(true);
    expect(urls.has(normalizeUrl("https://blog.example.com/gpu-proving"))).toBe(true);
  });

  it("normalizes URLs consistently", () => {
    const urls = extractUrlsFromMarkdown(
      "[Test](https://GitHub.com/Foo/Bar)"
    );
    expect(urls.has(normalizeUrl("https://github.com/Foo/Bar"))).toBe(true);
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

  it("matches normalized URLs (with trailing slash, www, tracking params)", () => {
    const markdown =
      "- [Test](https://github.com/owner/repo)\n- [Blog](https://www.example.com/post)";
    const mockReadFile = vi.fn().mockReturnValue(markdown);

    const candidates = [
      makeCand("https://github.com/owner/repo/"),
      makeCand("https://www.example.com/post?utm_source=twitter"),
      makeCand("https://github.com/other/repo"),
    ];

    const result = dedup(candidates, baseConfig, mockReadFile as any);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://github.com/other/repo");
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
