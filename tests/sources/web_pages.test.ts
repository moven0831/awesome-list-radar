import { describe, it, expect, vi } from "vitest";
import {
  collectWebPages,
  cleanHtml,
  extractFirstJsonArray,
  resolveUrl,
} from "../../src/sources/web_pages";
import type { RadarConfig } from "../../src/config";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
  getInput: vi.fn().mockReturnValue("test-api-key"),
}));

const baseConfig = {
  description: "test",
  list_file: "README.md",
  sources: {
    web_pages: {
      urls: ["https://example.com/blog"],
      keywords: ["gpu proving", "webgpu"],
    },
  },
  classification: {
    model: "claude-sonnet-4-6",
    threshold: 70,
    max_issues_per_run: 5,
  },
  issue_template: { labels: ["radar"] },
} as RadarConfig;

describe("cleanHtml", () => {
  it("strips script and style tags with content", () => {
    const html =
      '<div>Hello<script>alert("xss")</script> World<style>.x{color:red}</style></div>';
    const result = cleanHtml(html);
    expect(result).not.toContain("alert");
    expect(result).not.toContain("color");
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  it("strips nav, footer, header tags", () => {
    const html = "<nav>Menu</nav><main>Content</main><footer>Footer</footer>";
    const result = cleanHtml(html);
    expect(result).not.toContain("Menu");
    expect(result).not.toContain("Footer");
    expect(result).toContain("Content");
  });

  it("converts anchor tags to markdown links", () => {
    const html = '<a href="https://example.com/post">My Article</a>';
    const result = cleanHtml(html);
    expect(result).toContain("[My Article](https://example.com/post)");
  });

  it("truncates to max length", () => {
    const html = "x".repeat(20_000);
    const result = cleanHtml(html);
    expect(result.length).toBeLessThanOrEqual(15_000);
  });
});

describe("extractFirstJsonArray", () => {
  it("extracts a valid JSON array from text", () => {
    const text =
      'Here are the links:\n[{"title":"Post 1","url":"https://example.com/1"}]\nDone.';
    const result = extractFirstJsonArray(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      title: "Post 1",
      url: "https://example.com/1",
    });
  });

  it("returns empty array when no JSON array found", () => {
    expect(extractFirstJsonArray("No JSON here")).toEqual([]);
  });

  it("filters out invalid items", () => {
    const text =
      '[{"title":"Valid","url":"https://example.com"},{"invalid":true},{"title":123,"url":"bad"}]';
    const result = extractFirstJsonArray(text);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Valid");
  });
});

describe("resolveUrl", () => {
  it("resolves relative URLs against base", () => {
    expect(resolveUrl("https://example.com/blog", "/posts/1")).toBe(
      "https://example.com/posts/1"
    );
  });

  it("returns absolute URLs unchanged", () => {
    expect(
      resolveUrl("https://example.com", "https://other.com/post")
    ).toBe("https://other.com/post");
  });

  it("returns href as-is for invalid URLs", () => {
    expect(resolveUrl("not-a-url", "also-not-a-url")).toBe("also-not-a-url");
  });
});

describe("collectWebPages", () => {
  it("returns empty array when web_pages source is not configured", async () => {
    const config = { ...baseConfig, sources: {} } as RadarConfig;
    const candidates = await collectWebPages(config);
    expect(candidates).toEqual([]);
  });

  it("extracts links and filters by keywords", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          '<html><body><a href="/gpu-proving">GPU Proving Post</a><a href="/cooking">Cooking Tips</a></body></html>'
        ),
    });

    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: '[{"title":"GPU Proving Post","url":"https://example.com/gpu-proving"},{"title":"Cooking Tips","url":"https://example.com/cooking"}]',
            },
          ],
        }),
      },
    } as any;

    const candidates = await collectWebPages(
      baseConfig,
      mockFetch as any,
      mockClient
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      title: "GPU Proving Post",
      url: "https://example.com/gpu-proving",
      source: "web_page",
    });
    expect(candidates[0].metadata.pageName).toBe("example.com");
  });

  it("includes all links when no keywords configured", async () => {
    const config = {
      ...baseConfig,
      sources: {
        web_pages: {
          urls: ["https://example.com/blog"],
        },
      },
    } as RadarConfig;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><body>Content</body></html>"),
    });

    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: '[{"title":"Post 1","url":"https://example.com/1"},{"title":"Post 2","url":"https://example.com/2"}]',
            },
          ],
        }),
      },
    } as any;

    const candidates = await collectWebPages(config, mockFetch as any, mockClient);
    expect(candidates).toHaveLength(2);
  });

  it("handles fetch failures gracefully", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new Error("Network error"));

    const mockClient = { messages: { create: vi.fn() } } as any;

    const candidates = await collectWebPages(
      baseConfig,
      mockFetch as any,
      mockClient
    );
    expect(candidates).toEqual([]);
  });

  it("handles LLM failures gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><body>Content</body></html>"),
    });

    const mockClient = {
      messages: {
        create: vi
          .fn()
          .mockRejectedValue(new Error("API error")),
      },
    } as any;

    const candidates = await collectWebPages(
      baseConfig,
      mockFetch as any,
      mockClient
    );
    expect(candidates).toEqual([]);
  });

  it("handles multiple URLs", async () => {
    const config = {
      ...baseConfig,
      sources: {
        web_pages: {
          urls: [
            "https://blog1.example.com/",
            "https://blog2.example.com/",
          ],
          keywords: ["gpu"],
        },
      },
    } as RadarConfig;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><body>Content</body></html>"),
    });

    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: '[{"title":"GPU Post","url":"https://example.com/gpu"}]',
            },
          ],
        }),
      },
    } as any;

    const candidates = await collectWebPages(
      config,
      mockFetch as any,
      mockClient
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(candidates).toHaveLength(2);
  });

  it("handles non-OK HTTP responses", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden"),
    });

    const mockClient = { messages: { create: vi.fn() } } as any;

    const candidates = await collectWebPages(
      baseConfig,
      mockFetch as any,
      mockClient
    );
    expect(candidates).toEqual([]);
  });
});
