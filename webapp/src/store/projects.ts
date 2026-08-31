export interface ProjectRow {
  id: string;
  name: string;
  directory: string;
  directories?: string[];
  stale: boolean;
  firstSeen: string;
  lastSeen: string;
  sessionCount: number;
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
  durationMs: number;
}

export interface Proposal {
  id: string;
  projectId: string;
  name: string;
  purpose: string | null;
  sessionIds: string[];
  demandes: { label: string; description: string }[];
  enjeux: { label: string; description: string }[];
  rationale: string | null;
  status: "pending" | "accepted" | "dismissed" | "stale";
  createdAt: string;
}

export interface ProjectDetail extends ProjectRow {
  byModel: { model: string; totalCost: number; sessions: number }[];
  ungroupedSessions: number;
  features: any[];
  proposals: Proposal[];
}

interface ProjectsState {
  items: ProjectRow[];
  current: ProjectDetail | null;
  loading: boolean;
  error: string | null;
}

const initial: ProjectsState = {
  items: [],
  current: null,
  loading: false,
  error: null,
};

export function projectsReducer(
  state: ProjectsState = initial,
  action: any,
): ProjectsState {
  switch (action.type) {
    case "PROJECTS_LOAD_REQUESTED":
    case "PROJECT_LOAD_REQUESTED":
      return { ...state, loading: true, error: null };
    case "PROJECTS_LOAD_SUCCESS":
      return { ...state, loading: false, items: action.payload.data };
    case "PROJECT_LOAD_SUCCESS":
      return { ...state, loading: false, current: action.payload.data };
    case "PROJECTS_LOAD_ERROR":
    case "PROJECT_LOAD_ERROR":
      return { ...state, loading: false, error: String(action.payload.error) };
    default:
      return state;
  }
}