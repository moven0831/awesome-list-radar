import * as core from "@actions/core";
import type { RadarConfig } from "../config";
import type { Candidate } from "../sources/types";

export function filterByMetadata(
  candidates: Candidate[],
  config: RadarConfig
): Candidate[] {
  const filter = config.filter;

  const filtered = candidates.filter((c) => {
    if (filter.exclude_forks && c.metadata.fork === true) return false;
    if (filter.exclude_archived && c.metadata.archived === true) return false;
    if (filter.require_license && !c.metadata.license) return false;
    if (filter.max_age_days) {
      const dateField = c.metadata.lastPushedAt || c.metadata.publishedAt;
      if (dateField) {
        const age =
          (Date.now() - new Date(dateField).getTime()) / (1000 * 60 * 60 * 24);
        if (age > filter.max_age_days) return false;
      }
    }
    return true;
  });

  core.info(
    `Metadata filter: ${candidates.length} → ${filtered.length} candidates`
  );
  return filtered;
}
