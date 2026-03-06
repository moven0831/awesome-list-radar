import { readFileSync, writeFileSync } from "node:fs";
import * as core from "@actions/core";
import type { Candidate } from "./sources/types";

export interface SeenEntry {
  status: "accepted" | "rejected" | "filtered";
  seen_at: string;
}

export interface SourceWatermark {
  last_run: string;
  last_result_id?: string;
}

export interface RadarState {
  seen_urls: Record<string, SeenEntry>;
  watermarks: Record<string, SourceWatermark>;
}

const EMPTY_STATE: RadarState = {
  seen_urls: {},
  watermarks: {},
};

export function loadState(filePath: string): RadarState {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    core.info(`No existing state file at "${filePath}", starting fresh`);
    return { seen_urls: {}, watermarks: {} };
  }

  try {
    const parsed = JSON.parse(content);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.seen_urls === "object"
    ) {
      return {
        seen_urls: parsed.seen_urls ?? {},
        watermarks: parsed.watermarks ?? {},
      };
    }
    core.warning(`Invalid state file structure at "${filePath}", starting fresh`);
  } catch {
    core.warning(`Corrupt state file at "${filePath}" (invalid JSON), starting fresh`);
  }
  return { seen_urls: {}, watermarks: {} };
}

export function saveState(filePath: string, state: RadarState): void {
  writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
  core.info(
    `State saved to "${filePath}" (${Object.keys(state.seen_urls).length} URLs tracked)`
  );
}

export function filterSeenCandidates(
  candidates: Candidate[],
  state: RadarState
): Candidate[] {
  const before = candidates.length;
  const filtered = candidates.filter((c) => {
    const normalized = c.url.toLowerCase();
    return !state.seen_urls[normalized];
  });

  if (before !== filtered.length) {
    core.info(
      `State filter: ${before} → ${filtered.length} candidates (${before - filtered.length} already seen)`
    );
  }

  return filtered;
}

export function recordCandidates(
  state: RadarState,
  candidates: Candidate[],
  status: "accepted" | "rejected" | "filtered"
): void {
  const now = new Date().toISOString();
  for (const c of candidates) {
    state.seen_urls[c.url.toLowerCase()] = { status, seen_at: now };
  }
}

export function updateWatermark(
  state: RadarState,
  sourceKey: string,
  lastResultId?: string
): void {
  state.watermarks[sourceKey] = {
    last_run: new Date().toISOString(),
    last_result_id: lastResultId,
  };
}
