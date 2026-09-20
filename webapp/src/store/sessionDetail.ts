export interface SessionCallRow {
  sessionId: string;
  timeCreated: number;
  cost: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  cacheRead: number;
  cacheWrite: number;
  model: string;
  agent: string | null;
  mode: string | null;
}

export interface SessionProfile {
  session: {
    id: string;
    title: string;
    source: string;
    projectName: string;
    directory: string;
    model: string;
    agent: string | null;
    cost: number;
    tokensInput: number;
    tokensOutput: number;
    tokensReasoning: number;
    timeCreated: number;
  };
  source: string;
  profile: string | null;
  configId: string | null;
  config: unknown | null;
  offeredTools: string[];
  totals: {
    cost: number;
    tokensInput: number;
    tokensOutput: number;
    tokensReasoning: number;
    cacheRead: number;
    cacheWrite: number;
    llmCalls: number;
    toolCalls: number;
    treeSize: number;
  };
  byModel: {
    model: string;
    cost: number;
    tokensInput: number;
    tokensOutput: number;
    llmCalls: number;
  }[];
  tools: { tool: string; count: number; completed: number; error: number }[];
  calls: SessionCallRow[];
  tree: {
    sessionId: string;
    parentId: string | null;
    agent: string | null;
    model: string;
    cost: number;
  }[];
}

interface SessionDetailState {
  data: SessionProfile | null;
  loading: boolean;
  error: string | null;
}

const initial: SessionDetailState = { data: null, loading: false, error: null };

export function sessionDetailReducer(
  state: SessionDetailState = initial,
  action: any,
): SessionDetailState {
  switch (action.type) {
    case "SESSION_DETAIL_LOAD_REQUESTED":
      return { ...state, loading: true, error: null, data: null };
    case "SESSION_DETAIL_LOAD_SUCCESS":
      return { ...state, loading: false, data: action.payload.data };
    case "SESSION_DETAIL_LOAD_ERROR":
      return { ...state, loading: false, error: String(action.payload.error) };
    default:
      return state;
  }
}
