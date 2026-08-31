export interface OpenCodeSession {
  id: string;
  projectId: string;
  projectName: string;
  directory: string;
  path: string | null;
  parentId: string | null;
  isSubagent: boolean;
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
  timeCompacting: number | null;
}

export interface OpenCodeProject {
  id: string;
  name: string;
}

export interface SessionListFilters {
  project?: string;
  directory?: string;
  model?: string;
  from?: string;
  to?: string;
  annotated?: "yes" | "no";
  analysed?: string;
  parentOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface SessionPage {
  items: OpenCodeSession[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionAnalysisInput {
  id: string;
  title: string;
  model: string;
  agent: string | null;
  timeCreated: number;
  userMessages: string[];
  todos: { content: string; status: string }[];
  summaryAdditions: number;
  summaryDeletions: number;
  summaryFiles: number;
}

export interface SessionAggregate {
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
  sessions: number;
}

export interface DirectoryAggregate extends SessionAggregate {
  directory: string;
  name: string;
  firstSeen: number;
  lastSeen: number;
}

export interface DirectoryModelAggregate extends SessionAggregate {
  directory: string;
  model: string;
}

export interface ModelAggregate extends SessionAggregate {
  model: string;
}

export interface DayAggregate extends SessionAggregate {
  day: string;
}

export class OpendbNotFoundError extends Error {
  constructor(path: string) {
    super(`OpenCode database not found at ${path}`);
    this.name = "OpendbNotFoundError";
  }
}