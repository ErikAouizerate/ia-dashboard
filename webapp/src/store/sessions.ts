export interface SessionRow {
  id: string;
  title: string;
  projectName: string;
  projectId: string | null;
  directory: string;
  isSubagent: boolean;
  model: string;
  agent: string | null;
  cost: number;
  tokensInput: number;
  tokensOutput: number;
  timeCreated: number;
}

interface SessionsState {
  items: SessionRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: Record<string, string>;
  meta: { projects: { id: string; name: string }[]; models: string[] };
  loading: boolean;
  error: string | null;
}

const initial: SessionsState = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
  filters: {},
  meta: { projects: [], models: [] },
  loading: false,
  error: null,
};

export function sessionsReducer(
  state: SessionsState = initial,
  action: any,
): SessionsState {
  switch (action.type) {
    case "SESSIONS_LOAD_REQUESTED":
      return {
        ...state,
        loading: true,
        error: null,
        filters: action.payload.filters ?? {},
      };
    case "SESSIONS_LOAD_SUCCESS":
      return {
        ...state,
        loading: false,
        items: action.payload.data.items,
        total: action.payload.data.total,
      };
    case "SESSIONS_LOAD_ERROR":
      return { ...state, loading: false, error: String(action.payload.error) };
    case "META_LOAD_SUCCESS":
      return { ...state, meta: action.payload.data };
    default:
      return state;
  }
}