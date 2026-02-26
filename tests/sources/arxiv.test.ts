import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectArxiv,
  buildArxivQuery,
  buildArxivUrl,
} from "../../src/sources/arxiv";
import type { RadarConfig } from "../../src/config";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

const fixtureXml = readFileSync(
  join(__dirname, "../fixtures/arxiv-response.xml"),
  "utf-8"
);

const baseConfig = {
  description: "test",
  list_file: "README.md",
  sources: {
    arxiv: {
      categories: ["cs.CR", "cs.DC"],
      keywords: ["GPU", "MSM", "zero-knowledge"],
    },
  },
  classification: {
    model: "claude-sonnet-4-6",
    threshold: 70,
    max_issues_per_run: 5,
  },
  issue_template: { labels: ["radar"] },
} as RadarConfig;

describe("buildArxivQuery", () => {
  it("combines categories and keywords with AND", () => {
    const query = buildArxivQuery(baseConfig);
    expect(query).toContain("cat:cs.CR");
    expect(query).toContain("cat:cs.DC");
    expect(query).toContain("AND");
    expect(query).toContain('all:"GPU"');
    expect(query).toContain('all:"MSM"');
  });

  it("quotes keywords for exact matching", () => {
    const config = {
      ...baseConfig,
      sources: {
        arxiv: {
          categories: ["cs.CR"],
          keywords: ["zero knowledge proofs"],
        },
      },
    } as RadarConfig;

    const query = buildArxivQuery(config);
    expect(query).toContain('all:"zero knowledge proofs"');
  });
});

describe("buildArxivUrl", () => {
  it("properly encodes the query string", () => {
    const query = '(cat:cs.CR OR cat:cs.DC) AND (all:"GPU" OR all:"C++")';
    const url = buildArxivUrl(query);

    expect(url).toContain("search_query=");
    // URL should be parseable without errors
    const parsed = new URL(url);
    expect(parsed.searchParams.get("search_query")).toBe(query);
    expect(parsed.searchParams.get("max_results")).toBe("50");
  });
});

describe("collectArxiv", () => {
  it("parses XML response into Candidate objects", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => fixtureXml,
    });

    const candidates = await collectArxiv(baseConfig, mockFetch as any);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      url: "http://arxiv.org/abs/2401.12345v1",
      title: expect.stringContaining("GPU-Accelerated"),
      source: "arxiv",
    });
    expect(candidates[0].metadata.authors).toEqual([
      "Alice Smith",
      "Bob Jones",
    ]);
    expect(candidates[0].metadata.publishedAt).toBe("2024-01-15T00:00:00Z");

    expect(candidates[1].title).toContain("NTT Optimization");
    expect(candidates[1].metadata.authors).toEqual(["Carol White"]);
  });

  it("handles single-entry XML response", async () => {
    const singleEntryXml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>ArXiv Query</title>
        <entry>
          <id>http://arxiv.org/abs/2401.00001v1</id>
          <title>Single Paper</title>
          <summary>A single paper summary.</summary>
          <author><name>Solo Author</name></author>
          <published>2024-01-01T00:00:00Z</published>
        </entry>
      </feed>`;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => singleEntryXml,
    });

    const candidates = await collectArxiv(baseConfig, mockFetch as any);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe("Single Paper");
    expect(candidates[0].metadata.authors).toEqual(["Solo Author"]);
  });

  it("returns empty array when arxiv source is not configured", async () => {
    const config = { ...baseConfig, sources: {} } as RadarConfig;
    const candidates = await collectArxiv(config);
    expect(candidates).toEqual([]);
  });

  it("handles API errors gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    const candidates = await collectArxiv(baseConfig, mockFetch as any);
    expect(candidates).toEqual([]);
  });

  it("handles fetch exceptions gracefully", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("network error"));

    const candidates = await collectArxiv(baseConfig, mockFetch as any);
    expect(candidates).toEqual([]);
  });

  it("handles empty feed response", async () => {
    const emptyXml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>ArXiv Query</title>
      </feed>`;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => emptyXml,
    });

    const candidates = await collectArxiv(baseConfig, mockFetch as any);
    expect(candidates).toEqual([]);
  });
});
