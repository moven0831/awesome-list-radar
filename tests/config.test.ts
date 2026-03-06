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
    expect(config.classification.max_classifications_per_run).toBe(5);
    expect(config.issue_template.labels).toEqual(["radar", "needs-review"]);
  });

  it("applies defaults for a minimal config", () => {
    const config = parseConfig(fixture("minimal-config.yml"));

    expect(config.list_file).toBe("README.md");
    expect(config.sources.github?.topics).toEqual(["typescript"]);
    expect(config.sources.github?.min_stars).toBe(0);
    expect(config.sources.github?.created_after).toBe("30d");
    expect(config.classification.threshold).toBe(70);
    expect(config.classification.max_classifications_per_run).toBe(5);
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

  it("parses filter config with all options", () => {
    const config = parseConfig(`
description: test
sources:
  github:
    topics: [test]
filter:
  include:
    - gpu
    - webgpu
  require_all:
    - fast
  exclude:
    - deprecated
    - toy
  exclude_forks: true
  exclude_archived: true
  require_license: true
  max_age_days: 90
`);
    expect(config.filter.include).toEqual(["gpu", "webgpu"]);
    expect(config.filter.require_all).toEqual(["fast"]);
    expect(config.filter.exclude).toEqual(["deprecated", "toy"]);
    expect(config.filter.exclude_forks).toBe(true);
    expect(config.filter.exclude_archived).toBe(true);
    expect(config.filter.require_license).toBe(true);
    expect(config.filter.max_age_days).toBe(90);
  });

  it("applies filter defaults when filter is not specified", () => {
    const config = parseConfig(fixture("minimal-config.yml"));
    expect(config.filter).toBeDefined();
    expect(config.filter.exclude_forks).toBe(false);
    expect(config.filter.exclude_archived).toBe(false);
    expect(config.filter.require_license).toBe(false);
    expect(config.filter.max_age_days).toBeUndefined();
    expect(config.filter.include).toBeUndefined();
    expect(config.filter.require_all).toBeUndefined();
    expect(config.filter.exclude).toBeUndefined();
  });

  it("rejects invalid max_age_days (negative)", () => {
    expect(() =>
      parseConfig(`
description: test
sources:
  github:
    topics: [test]
filter:
  max_age_days: -5
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

  it("applies defaults for issue_template new fields", () => {
    const config = parseConfig(`
description: test
sources:
  github:
    topics: [test]
`);
    expect(config.issue_template.title_prefix).toBe("[Radar]");
    expect(config.issue_template.include_fields).toBeUndefined();
    expect(config.issue_template.suggested_entry_format).toBeUndefined();
  });

  it("parses custom issue_template fields", () => {
    const config = parseConfig(`
description: test
sources:
  github:
    topics: [test]
issue_template:
  title_prefix: "[New]"
  include_fields:
    - url
    - stars
  suggested_entry_format: "- [{{name}}]({{url}})"
`);
    expect(config.issue_template.title_prefix).toBe("[New]");
    expect(config.issue_template.include_fields).toEqual(["url", "stars"]);
    expect(config.issue_template.suggested_entry_format).toBe("- [{{name}}]({{url}})");
  });

  it("supports max_classifications_per_run replacing max_issues_per_run", () => {
    const config = parseConfig(`
description: test
sources:
  github:
    topics: [test]
classification:
  max_classifications_per_run: 10
`);
    expect(config.classification.max_classifications_per_run).toBe(10);
  });

  it("supports max_issues_per_run as deprecated alias", () => {
    const config = parseConfig(`
description: test
sources:
  github:
    topics: [test]
classification:
  max_issues_per_run: 8
`);
    expect(config.classification.max_classifications_per_run).toBe(8);
  });

  it("prefers max_classifications_per_run over max_issues_per_run", () => {
    const config = parseConfig(`
description: test
sources:
  github:
    topics: [test]
classification:
  max_classifications_per_run: 10
  max_issues_per_run: 8
`);
    expect(config.classification.max_classifications_per_run).toBe(10);
  });

  it("defaults max_classifications_per_run to 5 when neither is set", () => {
    const config = parseConfig(`
description: test
sources:
  github:
    topics: [test]
`);
    expect(config.classification.max_classifications_per_run).toBe(5);
  });

  it("accepts optional max_budget_usd", () => {
    const config = parseConfig(`
description: test
sources:
  github:
    topics: [test]
classification:
  max_budget_usd: 0.50
`);
    expect(config.classification.max_budget_usd).toBe(0.5);
  });

  it("allows max_budget_usd to be omitted", () => {
    const config = parseConfig(`
description: test
sources:
  github:
    topics: [test]
`);
    expect(config.classification.max_budget_usd).toBeUndefined();
  });

  it("parses arxiv max_results and date_range", () => {
    const config = parseConfig(`
description: test
sources:
  arxiv:
    categories:
      - cs.CR
    keywords:
      - GPU
    max_results: 100
    date_range:
      start: "20240101"
      end: "20240131"
`);
    expect(config.sources.arxiv?.max_results).toBe(100);
    expect(config.sources.arxiv?.date_range).toEqual({
      start: "20240101",
      end: "20240131",
    });
  });

  it("applies arxiv max_results default of 50", () => {
    const config = parseConfig(`
description: test
sources:
  arxiv:
    categories:
      - cs.CR
    keywords:
      - GPU
`);
    expect(config.sources.arxiv?.max_results).toBe(50);
    expect(config.sources.arxiv?.date_range).toBeUndefined();
  });

  it("rejects arxiv max_results out of range", () => {
    expect(() =>
      parseConfig(`
description: test
sources:
  arxiv:
    categories:
      - cs.CR
    keywords:
      - GPU
    max_results: 1000
`)
    ).toThrow();
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

  it("parses web_pages new config fields with defaults", () => {
    const config = parseConfig(`
description: test
sources:
  web_pages:
    urls:
      - https://example.com/blog
`);
    expect(config.sources.web_pages?.model).toBe("claude-haiku-4-5-20251001");
    expect(config.sources.web_pages?.request_timeout).toBe(30000);
    expect(config.sources.web_pages?.extraction_prompt).toBeUndefined();
    expect(config.sources.web_pages?.user_agent).toBeUndefined();
  });

  it("parses web_pages custom config fields", () => {
    const config = parseConfig(`
description: test
sources:
  web_pages:
    urls:
      - https://example.com/blog
    extraction_prompt: "Custom prompt"
    model: "claude-sonnet-4-6"
    request_timeout: 60000
    user_agent: "MyBot/1.0"
`);
    expect(config.sources.web_pages?.extraction_prompt).toBe("Custom prompt");
    expect(config.sources.web_pages?.model).toBe("claude-sonnet-4-6");
    expect(config.sources.web_pages?.request_timeout).toBe(60000);
    expect(config.sources.web_pages?.user_agent).toBe("MyBot/1.0");
  });

  it("rejects web_pages request_timeout out of range", () => {
    expect(() =>
      parseConfig(`
description: test
sources:
  web_pages:
    urls:
      - https://example.com/blog
    request_timeout: 500
`)
    ).toThrow();
  });
});
