import { getTableColumns } from "drizzle-orm/utils";
import {
  projects,
  sessionAnalyses,
  features,
  featureProposals,
  featureSessions,
  analysisStatus,
  proposalStatus,
} from "./schema";

describe("db schema", () => {
  it("defines the five core tables", () => {
    expect(Object.keys(getTableColumns(projects)).length).toBeGreaterThan(0);
    expect(Object.keys(getTableColumns(sessionAnalyses)).length).toBeGreaterThan(0);
    expect(Object.keys(getTableColumns(features)).length).toBeGreaterThan(0);
    expect(Object.keys(getTableColumns(featureProposals)).length).toBeGreaterThan(0);
    expect(Object.keys(getTableColumns(featureSessions)).length).toBeGreaterThan(0);
  });

  it("features has no status column", () => {
    expect("status" in getTableColumns(features)).toBe(false);
    expect("projectId" in getTableColumns(features)).toBe(true);
  });

  it("feature_proposals has a status enum with pending/accepted/dismissed/stale", () => {
    expect(proposalStatus.enumValues).toEqual(["pending", "accepted", "dismissed", "stale"]);
    expect(analysisStatus.enumValues).toEqual(["pending", "analyzing", "done", "error"]);
  });
});