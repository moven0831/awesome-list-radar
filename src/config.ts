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
  max_results: z.number().int().min(1).max(1000).default(100),
  sort: z.enum(["stars", "updated", "best-match"]).default("stars"),
  exclude_forks: z.boolean().default(false),
  exclude_archived: z.boolean().default(false),
});

const ArxivSourceSchema = z.object({
  categories: z.array(z.string()).min(1),
  keywords: z.array(z.string()).min(1),
  max_results: z.number().int().min(1).max(500).default(50),
  date_range: z
    .object({
      start: z
        .string()
        .regex(/^\d{8}(\d{6})?$/, "Must be YYYYMMDD or YYYYMMDDHHMMSS"),
      end: z
        .string()
        .regex(/^\d{8}(\d{6})?$/, "Must be YYYYMMDD or YYYYMMDDHHMMSS"),
    })
    .refine((r) => r.start <= r.end, {
      message: "date_range.start must be <= date_range.end",
    })
    .optional(),
});

const BlogsSourceSchema = z.object({
  feeds: z.array(z.string().url()).min(1),
  keywords: z.array(z.string()).optional(),
});

const WebPagesSourceSchema = z.object({
  urls: z.array(z.string().url()).min(1),
  keywords: z.array(z.string()).optional(),
  extraction_prompt: z.string().min(1).optional(),
  model: z.string().min(1).default("claude-haiku-4-5-20251001"),
  request_timeout: z.number().int().min(1000).max(120000).default(30000),
  user_agent: z.string().optional(),
});

const RegistryEntrySchema = z.object({
  type: z.enum(["npm", "pypi", "crates"]),
  keywords: z.array(z.string()).min(1),
  min_downloads: z.number().int().nonnegative().default(0),
  max_results: z.number().int().min(1).max(250).default(50),
});

const RegistrySourceSchema = z.array(RegistryEntrySchema).min(1);

const SourcesSchema = z.object({
  github: GithubSourceSchema.optional(),
  arxiv: ArxivSourceSchema.optional(),
  blogs: BlogsSourceSchema.optional(),
  web_pages: WebPagesSourceSchema.optional(),
  registries: RegistrySourceSchema.optional(),
});

const FilterSchema = z
  .object({
    include: z.array(z.string()).optional(),
    require_all: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
    exclude_forks: z.boolean().default(false),
    exclude_archived: z.boolean().default(false),
    require_license: z.boolean().default(false),
    max_age_days: z.number().int().positive().optional(),
  })
  .default({});

const ClassificationSchema = z.object({
  model: z.string().default("claude-sonnet-4-6"),
  threshold: z.number().min(0).max(100).default(70),
  max_classifications_per_run: z.number().int().positive().optional(),
  max_issues_per_run: z.number().int().positive().optional(), // deprecated alias
  max_budget_usd: z.number().positive().optional(),
  system_prompt: z.string().optional(),
  context: z.string().optional(),
  max_description_length: z.number().int().positive().max(10000).default(500),
  categories: z.array(z.string()).optional(),
}).transform((val) => ({
  ...val,
  max_classifications_per_run: val.max_classifications_per_run ?? val.max_issues_per_run ?? 5,
}));

const IssueTemplateSchema = z.object({
  labels: z.array(z.string()).default(["radar", "needs-review"]),
  title_prefix: z.string().default("[Radar]"),
  include_fields: z.array(z.enum(["url", "source", "relevanceScore", "suggestedCategory", "tags", "stars", "language", "authors"])).optional(),
  suggested_entry_format: z.string().optional(),
});

export const RadarConfigSchema = z.object({
  description: z.string().min(1),
  list_file: z.string().default("README.md"),
  sources: SourcesSchema.refine(
    (s) => s.github || s.arxiv || s.blogs || s.web_pages || s.registries,
    "At least one source must be configured"
  ),
  filter: FilterSchema,
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
