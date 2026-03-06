import { describe, it, expect, vi } from "vitest";
import { collectRegistries } from "../../src/sources/registry";
import type { RadarConfig } from "../../src/config";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

const baseConfig = {
  description: "test",
  list_file: "README.md",
  sources: {
    registries: [
      {
        type: "npm" as const,
        keywords: ["webgpu"],
        min_downloads: 0,
        max_results: 50,
      },
    ],
  },
  classification: {
    model: "claude-sonnet-4-6",
    threshold: 70,
    max_issues_per_run: 5,
  },
  issue_template: { labels: ["radar"] },
} as RadarConfig;

describe("collectRegistries", () => {
  it("returns empty array when registries source is not configured", async () => {
    const config = { ...baseConfig, sources: {} } as RadarConfig;
    const candidates = await collectRegistries(config);
    expect(candidates).toEqual([]);
  });

  it("collects npm packages from search API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          objects: [
            {
              package: {
                name: "webgpu-utils",
                description: "Utility library for WebGPU",
                date: "2024-01-15T00:00:00Z",
              },
              score: { detail: { popularity: 0.5 } },
            },
            {
              package: {
                name: "webgpu-renderer",
                description: "A WebGPU renderer",
                date: "2024-01-10T00:00:00Z",
              },
              score: { detail: { popularity: 0.3 } },
            },
          ],
        }),
    });

    const candidates = await collectRegistries(baseConfig, mockFetch as any);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      url: "https://www.npmjs.com/package/webgpu-utils",
      title: "webgpu-utils",
      description: "Utility library for WebGPU",
      source: "registry",
    });
    expect(candidates[0].metadata.language).toBe("JavaScript");
    expect(candidates[0].metadata.publishedAt).toBe("2024-01-15T00:00:00Z");
    expect(candidates[1].title).toBe("webgpu-renderer");
  });

  it("collects PyPI packages by keyword lookup", async () => {
    const config = {
      ...baseConfig,
      sources: {
        registries: [
          {
            type: "pypi" as const,
            keywords: ["torch", "numpy"],
            min_downloads: 0,
            max_results: 50,
          },
        ],
      },
    } as RadarConfig;

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            info: {
              name: "torch",
              summary: "Tensors and neural networks in Python",
            },
            urls: [{ upload_time_iso_8601: "2024-02-01T00:00:00Z" }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            info: {
              name: "numpy",
              summary: "Fundamental package for array computing",
            },
            urls: [{ upload_time_iso_8601: "2024-01-20T00:00:00Z" }],
          }),
      });

    const candidates = await collectRegistries(config, mockFetch as any);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      url: "https://pypi.org/project/torch/",
      title: "torch",
      source: "registry",
    });
    expect(candidates[0].metadata.language).toBe("Python");
    expect(candidates[1].title).toBe("numpy");
  });

  it("collects crates.io packages and filters by min_downloads", async () => {
    const config = {
      ...baseConfig,
      sources: {
        registries: [
          {
            type: "crates" as const,
            keywords: ["wgpu"],
            min_downloads: 1000,
            max_results: 50,
          },
        ],
      },
    } as RadarConfig;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          crates: [
            {
              name: "wgpu",
              description: "Rusty WebGPU API wrapper",
              downloads: 50000,
              updated_at: "2024-01-15T00:00:00Z",
            },
            {
              name: "wgpu-tiny",
              description: "A tiny wrapper",
              downloads: 500,
              updated_at: "2024-01-10T00:00:00Z",
            },
          ],
        }),
    });

    const candidates = await collectRegistries(config, mockFetch as any);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      url: "https://crates.io/crates/wgpu",
      title: "wgpu",
      source: "registry",
    });
    expect(candidates[0].metadata.language).toBe("Rust");
  });

  it("handles multiple registry entries", async () => {
    const config = {
      ...baseConfig,
      sources: {
        registries: [
          {
            type: "npm" as const,
            keywords: ["webgpu"],
            min_downloads: 0,
            max_results: 50,
          },
          {
            type: "crates" as const,
            keywords: ["wgpu"],
            min_downloads: 0,
            max_results: 50,
          },
        ],
      },
    } as RadarConfig;

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            objects: [
              {
                package: {
                  name: "webgpu-lib",
                  description: "A lib",
                  date: "2024-01-15T00:00:00Z",
                },
              },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            crates: [
              {
                name: "wgpu",
                description: "Rusty WebGPU",
                downloads: 10000,
                updated_at: "2024-01-15T00:00:00Z",
              },
            ],
          }),
      });

    const candidates = await collectRegistries(config, mockFetch as any);

    expect(candidates).toHaveLength(2);
    expect(candidates[0].title).toBe("webgpu-lib");
    expect(candidates[1].title).toBe("wgpu");
  });

  it("handles npm HTTP error gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    const candidates = await collectRegistries(baseConfig, mockFetch as any);
    expect(candidates).toEqual([]);
  });

  it("handles crates.io HTTP error gracefully", async () => {
    const config = {
      ...baseConfig,
      sources: {
        registries: [
          {
            type: "crates" as const,
            keywords: ["wgpu"],
            min_downloads: 0,
            max_results: 50,
          },
        ],
      },
    } as RadarConfig;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });

    const candidates = await collectRegistries(config, mockFetch as any);
    expect(candidates).toEqual([]);
  });

  it("handles PyPI lookup failure gracefully", async () => {
    const config = {
      ...baseConfig,
      sources: {
        registries: [
          {
            type: "pypi" as const,
            keywords: ["nonexistent-package-xyz"],
            min_downloads: 0,
            max_results: 50,
          },
        ],
      },
    } as RadarConfig;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const candidates = await collectRegistries(config, mockFetch as any);
    expect(candidates).toEqual([]);
  });

  it("handles fetch throwing an error gracefully", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new Error("Network error"));

    const candidates = await collectRegistries(baseConfig, mockFetch as any);
    expect(candidates).toEqual([]);
  });

  it("handles empty npm search results", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ objects: [] }),
    });

    const candidates = await collectRegistries(baseConfig, mockFetch as any);
    expect(candidates).toEqual([]);
  });

  it("warns when min_downloads is set for npm", async () => {
    const core = await import("@actions/core");
    const config = {
      ...baseConfig,
      sources: {
        registries: [
          {
            type: "npm" as const,
            keywords: ["webgpu"],
            min_downloads: 1000,
            max_results: 50,
          },
        ],
      },
    } as RadarConfig;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          objects: [
            {
              package: {
                name: "webgpu-utils",
                description: "Utility library",
                date: "2024-01-15T00:00:00Z",
              },
            },
          ],
        }),
    });

    const candidates = await collectRegistries(config, mockFetch as any);
    expect(candidates).toHaveLength(1);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("min_downloads is not supported for npm")
    );
  });

  it("warns when min_downloads is set for PyPI", async () => {
    const core = await import("@actions/core");
    const config = {
      ...baseConfig,
      sources: {
        registries: [
          {
            type: "pypi" as const,
            keywords: ["torch"],
            min_downloads: 1000,
            max_results: 50,
          },
        ],
      },
    } as RadarConfig;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          info: { name: "torch", summary: "Tensors" },
          urls: [{ upload_time_iso_8601: "2024-02-01T00:00:00Z" }],
        }),
    });

    const candidates = await collectRegistries(config, mockFetch as any);
    expect(candidates).toHaveLength(1);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("min_downloads is not supported for PyPI")
    );
  });

  it("truncates long descriptions", async () => {
    const longDesc = "x".repeat(2000);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          objects: [
            {
              package: {
                name: "test-pkg",
                description: longDesc,
                date: "2024-01-15T00:00:00Z",
              },
            },
          ],
        }),
    });

    const candidates = await collectRegistries(baseConfig, mockFetch as any);
    expect(candidates[0].description.length).toBeLessThanOrEqual(1000);
  });
});
