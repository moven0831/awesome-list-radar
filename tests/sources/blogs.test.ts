import { describe, it, expect, vi } from "vitest";
import { collectBlogs, matchesKeywords } from "../../src/sources/blogs.js";
import type { RadarConfig } from "../../src/config.js";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

const baseConfig = {
  description: "test",
  list_file: "README.md",
  sources: {
    blogs: {
      feeds: ["https://blog.example.com/feed.xml"],
      keywords: ["gpu proving", "webgpu crypto"],
    },
  },
  classification: {
    model: "claude-sonnet-4-6",
    threshold: 70,
    max_issues_per_run: 5,
  },
  issue_template: { labels: ["radar"] },
} as RadarConfig;

const mockFeedData = {
  title: "Example Blog",
  items: [
    {
      title: "New GPU Proving Technique Released",
      link: "https://blog.example.com/gpu-proving",
      contentSnippet: "A breakthrough in GPU proving for ZK systems",
      creator: "Alice",
      isoDate: "2024-01-15T00:00:00Z",
    },
    {
      title: "WebGPU Crypto Library Update",
      link: "https://blog.example.com/webgpu-crypto",
      contentSnippet: "Major update to our webgpu crypto toolkit",
      creator: "Bob",
      isoDate: "2024-01-14T00:00:00Z",
    },
    {
      title: "Unrelated Post About Cooking",
      link: "https://blog.example.com/cooking",
      contentSnippet: "Today we make pasta",
      creator: "Carol",
      isoDate: "2024-01-13T00:00:00Z",
    },
    {
      title: "Post Without Link",
      link: undefined,
      contentSnippet: "GPU proving content but no link",
    },
  ],
};

describe("matchesKeywords", () => {
  it("returns true when text contains a keyword (case-insensitive)", () => {
    expect(matchesKeywords("GPU Proving is great", ["gpu proving"])).toBe(true);
    expect(matchesKeywords("webgpu crypto lib", ["WebGPU Crypto"])).toBe(true);
  });

  it("returns false when no keywords match", () => {
    expect(matchesKeywords("unrelated content", ["gpu", "crypto"])).toBe(false);
  });
});

describe("collectBlogs", () => {
  it("filters entries by keywords and maps to Candidates", async () => {
    const mockParser = {
      parseURL: vi.fn().mockResolvedValue(mockFeedData),
    } as any;

    const candidates = await collectBlogs(baseConfig, mockParser);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      url: "https://blog.example.com/gpu-proving",
      title: "New GPU Proving Technique Released",
      source: "blog",
    });
    expect(candidates[0].metadata.authors).toEqual(["Alice"]);
    expect(candidates[0].metadata.feedName).toBe("Example Blog");

    expect(candidates[1].url).toBe("https://blog.example.com/webgpu-crypto");
  });

  it("includes all entries when no keywords configured", async () => {
    const config = {
      ...baseConfig,
      sources: {
        blogs: {
          feeds: ["https://blog.example.com/feed.xml"],
        },
      },
    } as RadarConfig;

    const mockParser = {
      parseURL: vi.fn().mockResolvedValue(mockFeedData),
    } as any;

    const candidates = await collectBlogs(config, mockParser);
    // 3 items with links (one has no link)
    expect(candidates).toHaveLength(3);
  });

  it("returns empty array when blogs source is not configured", async () => {
    const config = { ...baseConfig, sources: {} } as RadarConfig;
    const candidates = await collectBlogs(config);
    expect(candidates).toEqual([]);
  });

  it("handles feed parse errors gracefully", async () => {
    const mockParser = {
      parseURL: vi.fn().mockRejectedValue(new Error("404 Not Found")),
    } as any;

    const candidates = await collectBlogs(baseConfig, mockParser);
    expect(candidates).toEqual([]);
  });

  it("handles multiple feeds", async () => {
    const config = {
      ...baseConfig,
      sources: {
        blogs: {
          feeds: [
            "https://blog1.example.com/feed.xml",
            "https://blog2.example.com/feed.xml",
          ],
          keywords: ["gpu proving"],
        },
      },
    } as RadarConfig;

    const mockParser = {
      parseURL: vi.fn().mockResolvedValue(mockFeedData),
    } as any;

    const candidates = await collectBlogs(config, mockParser);
    expect(mockParser.parseURL).toHaveBeenCalledTimes(2);
    // 1 match per feed * 2 feeds
    expect(candidates).toHaveLength(2);
  });
});
