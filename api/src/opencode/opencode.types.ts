export interface OpenCodeSession {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  model: string;
  agent: string | null;
  cost: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
  summaryAdditions: number;
  summaryDeletions: number;
  summaryFiles: number;
  timeCreated: number;
  timeUpdated: number;
}

export interface OpenCodeProject {
  id: string;
  name: string;
}

export interface SessionListFilters {
  project?: string;
  model?: string;
  from?: string;
  to?: string;
  annotated?: "yes" | "no";
  page?: number;
  pageSize?: number;
}

export interface SessionPage {
  items: OpenCodeSession[];
  total: number;
  page: number;
  pageSize: number;
}

export class OpendbNotFoundError extends Error {
  constructor(path: string) {
    super(`OpenCode database not found at ${path}`);
    this.name = "OpendbNotFoundError";
  }
}