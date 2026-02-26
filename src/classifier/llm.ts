import Anthropic from "@anthropic-ai/sdk";
import * as core from "@actions/core";
import type { RadarConfig } from "../config.js";
import type { Candidate, ClassifiedCandidate } from "../sources/types.js";

const SYSTEM_PROMPT = `You are a relevance classifier for an awesome-list curation tool.
Given the list's description and a candidate resource, assess whether the candidate
belongs in the list. Respond with ONLY valid JSON matching this schema:

{
  "relevanceScore": <0-100 integer>,
  "suggestedCategory": "<section name from the list>",
  "suggestedTags": ["<tag1>", "<tag2>"],
  "reasoning": "<1-2 sentence explanation>"
}`;

function buildUserPrompt(candidate: Candidate, config: RadarConfig): string {
  return `## List Description
${config.description}

## Candidate
- **Title**: ${candidate.title}
- **URL**: ${candidate.url}
- **Source**: ${candidate.source}
- **Description**: ${candidate.description}
${candidate.metadata.stars !== undefined ? `- **Stars**: ${candidate.metadata.stars}` : ""}
${candidate.metadata.language ? `- **Language**: ${candidate.metadata.language}` : ""}
${candidate.metadata.authors?.length ? `- **Authors**: ${candidate.metadata.authors.join(", ")}` : ""}
${candidate.metadata.topics?.length ? `- **Topics**: ${candidate.metadata.topics.join(", ")}` : ""}

Rate relevance from 0-100 and suggest a category and tags.`;
}

interface ClassifyResult {
  relevanceScore: number;
  suggestedCategory: string;
  suggestedTags: string[];
  reasoning: string;
}

function parseClassifyResponse(text: string): ClassifyResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in LLM response");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (
    typeof parsed.relevanceScore !== "number" ||
    parsed.relevanceScore < 0 ||
    parsed.relevanceScore > 100
  ) {
    throw new Error("Invalid relevanceScore in LLM response");
  }

  return {
    relevanceScore: Math.round(parsed.relevanceScore),
    suggestedCategory: String(parsed.suggestedCategory ?? "Uncategorized"),
    suggestedTags: Array.isArray(parsed.suggestedTags)
      ? parsed.suggestedTags.map(String)
      : [],
    reasoning: String(parsed.reasoning ?? ""),
  };
}

export async function classifyCandidates(
  candidates: Candidate[],
  config: RadarConfig,
  client?: Anthropic
): Promise<ClassifiedCandidate[]> {
  if (candidates.length === 0) return [];

  const anthropic =
    client ?? new Anthropic({ apiKey: core.getInput("anthropic_api_key") });

  const maxIssues = config.classification.max_issues_per_run;
  const toClassify = candidates.slice(0, maxIssues);
  const classified: ClassifiedCandidate[] = [];

  for (const candidate of toClassify) {
    try {
      const message = await anthropic.messages.create({
        model: config.classification.model,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: buildUserPrompt(candidate, config) },
        ],
      });

      const text =
        message.content[0].type === "text" ? message.content[0].text : "";
      const result = parseClassifyResponse(text);

      if (result.relevanceScore >= config.classification.threshold) {
        classified.push({ ...candidate, ...result });
      } else {
        core.info(
          `Skipping "${candidate.title}" (score ${result.relevanceScore} < threshold ${config.classification.threshold})`
        );
      }
    } catch (error) {
      core.warning(
        `Classification failed for "${candidate.title}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return classified;
}

export { buildUserPrompt, parseClassifyResponse, SYSTEM_PROMPT };
