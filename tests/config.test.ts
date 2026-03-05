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

  it("applies defaults for new github fields", () => {
    const config = parseConfig(`
description: test
sources:
  github:
    topics: [test]
`);
    expect(config.sources.github?.max_results).toBe(100);
    expect(config.sources.github?.sort).toBe("stars");
    expect(config.sources.github?.exclude_forks).toBe(false);
    expect(config.sources.github?.exclude_archived).toBe(false);
  });

  it("parses explicit github config fields", () => {
    const config = parseConfig(`
description: test
sources:
  github:
    topics: [test]
    max_results: 500
    sort: updated
    exclude_forks: true
    exclude_archived: true
`);
    expect(config.sources.github?.max_results).toBe(500);
    expect(config.sources.github?.sort).toBe("updated");
    expect(config.sources.github?.exclude_forks).toBe(true);
    expect(config.sources.github?.exclude_archived).toBe(true);
  });

  it("rejects max_results greater than 1000", () => {
    expect(() =>
      parseConfig(`
description: test
sources:
  github:
    topics: [test]
    max_results: 1001
`)
    ).toThrow();
  });

  it("rejects max_results of 0", () => {
    expect(() =>
      parseConfig(`
description: test
sources:
  github:
    topics: [test]
    max_results: 0
`)
    ).toThrow();
  });
});
