export interface DashboardSummary {
  periodDays: number;
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
  sessionCount: number;
  byProject: {
    id: string | null;
    name: string;
    totalCost: number;
    sessions: number;
    tokensInput: number;
    tokensOutput: number;
    models: {
      model: string;
      totalCost: number;
      tokensInput: number;
      tokensOutput: number;
      sessions: number;
      share: number;
    }[];
  }[];
  byModel: {
    model: string;
    totalCost: number;
    sessions: number;
    tokensInput: number;
    tokensOutput: number;
  }[];
  byConfig: {
    configId: string | null;
    profile: string | null;
    sessions: number;
    totalCost: number;
    tokensInput: number;
    tokensOutput: number;
    models: {
      model: string;
      sessions: number;
      totalCost: number;
      tokensInput: number;
      tokensOutput: number;
    }[];
  }[];
  byDay: { day: string; totalCost: number; sessions: number }[];
  timeByProject: { directory: string; name: string; durationMs: number; id: string | null }[];
}

interface DashboardState {
  summary: DashboardSummary | null;
  periodDays: number;
  loading: boolean;
  error: string | null;
}

const initial: DashboardState = {
  summary: null,
  periodDays: 0,
  loading: false,
  error: null,
};

export function dashboardReducer(
  state: DashboardState = initial,
  action: any,
): DashboardState {
  switch (action.type) {
    case "DASHBOARD_LOAD_REQUESTED":
      return {
        ...state,
        loading: true,
        error: null,
        periodDays: action.payload?.periodDays ?? state.periodDays,
      };
    case "DASHBOARD_LOAD_SUCCESS":
      return { ...state, loading: false, summary: action.payload.data };
    case "DASHBOARD_LOAD_ERROR":
      return { ...state, loading: false, error: String(action.payload.error) };
    default:
      return state;
  }
}