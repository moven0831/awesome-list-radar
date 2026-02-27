import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const GithubSourceSchema = z.object({
  topics: z.array(z.string()).min(1),
  languages: z.array(z.string()).optional(),
  min_stars: z.number().int().nonnegative().default(0),
  created_after: z
    .string()
    .regex(/^\d+d$/, 'Must be in format "Nd" (e.g. "30d")')
    .default("30d"),
});

const ArxivSourceSchema = z.object({
  categories: z.array(z.string()).min(1),
  keywords: z.array(z.string()).min(1),
});

const BlogsSourceSchema = z.object({
  feeds: z.array(z.string().url()).min(1),
  keywords: z.array(z.string()).optional(),
});

const WebPagesSourceSchema = z.object({
  urls: z.array(z.string().url()).min(1),
  keywords: z.array(z.string()).optional(),
});

const SourcesSchema = z.object({
  github: GithubSourceSchema.optional(),
  arxiv: ArxivSourceSchema.optional(),
  blogs: BlogsSourceSchema.optional(),
  web_pages: WebPagesSourceSchema.optional(),
});

const ClassificationSchema = z.object({
  model: z.string().default("claude-sonnet-4-6"),
  threshold: z.number().min(0).max(100).default(70),
  max_issues_per_run: z.number().int().positive().default(5),
});

const IssueTemplateSchema = z.object({
  labels: z.array(z.string()).default(["radar", "needs-review"]),
});

export const RadarConfigSchema = z.object({
  description: z.string().min(1),
  list_file: z.string().default("README.md"),
  sources: SourcesSchema.refine(
    (s) => s.github || s.arxiv || s.blogs || s.web_pages,
    "At least one source must be configured"
  ),
  classification: ClassificationSchema.default({}),
  issue_template: IssueTemplateSchema.default({}),
});

export type RadarConfig = z.infer<typeof RadarConfigSchema>;

export function parseConfig(yamlContent: string): RadarConfig {
  const raw = parseYaml(yamlContent);
  return RadarConfigSchema.parse(raw);
}

export function loadConfig(filePath: string): RadarConfig {
  const content = readFileSync(filePath, "utf-8");
  return parseConfig(content);
}
