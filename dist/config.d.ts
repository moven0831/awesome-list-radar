import { z } from "zod";
export declare const RadarConfigSchema: z.ZodObject<{
    description: z.ZodString;
    list_file: z.ZodDefault<z.ZodString>;
    sources: z.ZodEffects<z.ZodObject<{
        github: z.ZodOptional<z.ZodObject<{
            topics: z.ZodArray<z.ZodString, "many">;
            languages: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            min_stars: z.ZodDefault<z.ZodNumber>;
            created_after: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            topics: string[];
            min_stars: number;
            created_after: string;
            languages?: string[] | undefined;
        }, {
            topics: string[];
            languages?: string[] | undefined;
            min_stars?: number | undefined;
            created_after?: string | undefined;
        }>>;
        arxiv: z.ZodOptional<z.ZodObject<{
            categories: z.ZodArray<z.ZodString, "many">;
            keywords: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            categories: string[];
            keywords: string[];
        }, {
            categories: string[];
            keywords: string[];
        }>>;
        blogs: z.ZodOptional<z.ZodObject<{
            feeds: z.ZodArray<z.ZodString, "many">;
            keywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            feeds: string[];
            keywords?: string[] | undefined;
        }, {
            feeds: string[];
            keywords?: string[] | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        github?: {
            topics: string[];
            min_stars: number;
            created_after: string;
            languages?: string[] | undefined;
        } | undefined;
        arxiv?: {
            categories: string[];
            keywords: string[];
        } | undefined;
        blogs?: {
            feeds: string[];
            keywords?: string[] | undefined;
        } | undefined;
    }, {
        github?: {
            topics: string[];
            languages?: string[] | undefined;
            min_stars?: number | undefined;
            created_after?: string | undefined;
        } | undefined;
        arxiv?: {
            categories: string[];
            keywords: string[];
        } | undefined;
        blogs?: {
            feeds: string[];
            keywords?: string[] | undefined;
        } | undefined;
    }>, {
        github?: {
            topics: string[];
            min_stars: number;
            created_after: string;
            languages?: string[] | undefined;
        } | undefined;
        arxiv?: {
            categories: string[];
            keywords: string[];
        } | undefined;
        blogs?: {
            feeds: string[];
            keywords?: string[] | undefined;
        } | undefined;
    }, {
        github?: {
            topics: string[];
            languages?: string[] | undefined;
            min_stars?: number | undefined;
            created_after?: string | undefined;
        } | undefined;
        arxiv?: {
            categories: string[];
            keywords: string[];
        } | undefined;
        blogs?: {
            feeds: string[];
            keywords?: string[] | undefined;
        } | undefined;
    }>;
    classification: z.ZodDefault<z.ZodObject<{
        model: z.ZodDefault<z.ZodString>;
        threshold: z.ZodDefault<z.ZodNumber>;
        max_issues_per_run: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        model: string;
        threshold: number;
        max_issues_per_run: number;
    }, {
        model?: string | undefined;
        threshold?: number | undefined;
        max_issues_per_run?: number | undefined;
    }>>;
    issue_template: z.ZodDefault<z.ZodObject<{
        labels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        labels: string[];
    }, {
        labels?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    description: string;
    list_file: string;
    sources: {
        github?: {
            topics: string[];
            min_stars: number;
            created_after: string;
            languages?: string[] | undefined;
        } | undefined;
        arxiv?: {
            categories: string[];
            keywords: string[];
        } | undefined;
        blogs?: {
            feeds: string[];
            keywords?: string[] | undefined;
        } | undefined;
    };
    classification: {
        model: string;
        threshold: number;
        max_issues_per_run: number;
    };
    issue_template: {
        labels: string[];
    };
}, {
    description: string;
    sources: {
        github?: {
            topics: string[];
            languages?: string[] | undefined;
            min_stars?: number | undefined;
            created_after?: string | undefined;
        } | undefined;
        arxiv?: {
            categories: string[];
            keywords: string[];
        } | undefined;
        blogs?: {
            feeds: string[];
            keywords?: string[] | undefined;
        } | undefined;
    };
    list_file?: string | undefined;
    classification?: {
        model?: string | undefined;
        threshold?: number | undefined;
        max_issues_per_run?: number | undefined;
    } | undefined;
    issue_template?: {
        labels?: string[] | undefined;
    } | undefined;
}>;
export type RadarConfig = z.infer<typeof RadarConfigSchema>;
export declare function parseConfig(yamlContent: string): RadarConfig;
export declare function loadConfig(filePath: string): RadarConfig;
