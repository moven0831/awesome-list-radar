import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseConfig, RadarConfigSchema } from "../src/config";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf-8");

describe("parseConfig", () => {
  it("parses a full valid config", () => {
    const config = parseConfig(fixture("valid-config.yml"));

    expect(config.description).toContain("GPU-accelerated");
    expect(config.list_file).toBe("README.md");
    expect(config.sources.github?.topics).toContain("webgpu");
    expect(config.sources.github?.min_stars).toBe(5);
    expect(config.sources.github?.created_after).toBe("30d");
    expect(config.sources.arxiv?.categories).toContain("cs.CR");
    expect(config.sources.arxiv?.keywords).toContain("GPU");
    expect(config.sources.blogs?.feeds).toHaveLength(1);
    expect(config.classification.model).toBe("claude-sonnet-4-6");
    expect(config.classification.threshold).toBe(70);
    expect(config.classification.max_issues_per_run).toBe(5);
    expect(config.issue_template.labels).toEqual(["radar", "needs-review"]);
  });

  it("applies defaults for a minimal config", () => {
    const config = parseConfig(fixture("minimal-config.yml"));

    expect(config.list_file).toBe("README.md");
    expect(config.sources.github?.topics).toEqual(["typescript"]);
    expect(config.sources.github?.min_stars).toBe(0);
    expect(config.sources.github?.created_after).toBe("30d");
    expect(config.classification.threshold).toBe(70);
    expect(config.classification.max_issues_per_run).toBe(5);
    expect(config.issue_template.labels).toEqual(["radar", "needs-review"]);
  });

  it("rejects config with no sources", () => {
    expect(() => parseConfig(fixture("invalid-no-sources.yml"))).toThrow();
  });

  it("rejects config with missing description", () => {
    expect(() =>
      parseConfig(`
sources:
  github:
    topics: [test]
`)
    ).toThrow();
  });

  it("rejects invalid created_after format", () => {
    expect(() =>
      parseConfig(`
description: test
sources:
  github:
    topics: [test]
    created_after: "30 days"
`)
    ).toThrow();
  });

  it("rejects invalid blog feed URLs", () => {
    expect(() =>
      parseConfig(`
description: test
sources:
  blogs:
    feeds:
      - not-a-url
`)
    ).toThrow();
  });

  it("rejects threshold out of range", () => {
    expect(() =>
      parseConfig(`
description: test
sources:
  github:
    topics: [test]
classification:
  threshold: 150
`)
    ).toThrow();
  });

  it("parses web_pages source config", () => {
    const config = parseConfig(`
description: test
sources:
  web_pages:
    urls:
      - https://example.com/blog
    keywords:
      - gpu
      - webgpu
`);
    expect(config.sources.web_pages?.urls).toEqual(["https://example.com/blog"]);
    expect(config.sources.web_pages?.keywords).toEqual(["gpu", "webgpu"]);
  });

  it("rejects invalid web_pages URLs", () => {
    expect(() =>
      parseConfig(`
description: test
sources:
  web_pages:
    urls:
      - not-a-url
`)
    ).toThrow();
  });

  it("accepts web_pages as sole source", () => {
    const config = parseConfig(`
description: test
sources:
  web_pages:
    urls:
      - https://example.com/blog
`);
    expect(config.sources.web_pages?.urls).toHaveLength(1);
  });

  it("parses registries source config", () => {
    const config = parseConfig(`
description: test
sources:
  registries:
    - type: npm
      keywords: [webgpu, wasm]
      min_downloads: 100
      max_results: 20
    - type: pypi
      keywords: [torch]
    - type: crates
      keywords: [wgpu]
`);
    expect(config.sources.registries).toHaveLength(3);
    expect(config.sources.registries![0].type).toBe("npm");
    expect(config.sources.registries![0].keywords).toEqual(["webgpu", "wasm"]);
    expect(config.sources.registries![0].min_downloads).toBe(100);
    expect(config.sources.registries![0].max_results).toBe(20);
    expect(config.sources.registries![1].min_downloads).toBe(0);
    expect(config.sources.registries![1].max_results).toBe(50);
  });

  it("accepts registries as sole source", () => {
    const config = parseConfig(`
description: test
sources:
  registries:
    - type: npm
      keywords: [react]
`);
    expect(config.sources.registries).toHaveLength(1);
  });

  it("rejects invalid registry type", () => {
    expect(() =>
      parseConfig(`
description: test
sources:
  registries:
    - type: maven
      keywords: [spring]
`)
    ).toThrow();
  });

  it("rejects registry entry with empty keywords", () => {
    expect(() =>
      parseConfig(`
description: test
sources:
  registries:
    - type: npm
      keywords: []
`)
    ).toThrow();
  });
});
