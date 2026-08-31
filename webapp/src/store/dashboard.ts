export interface DashboardSummary {
  periodDays: number;
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
  sessionCount: number;
  analysedCount: number;
  featureCount: number;
  byProject: {
    id: string | null;
    name: string;
    totalCost: number;
    sessions: number;
    tokensInput: number;
    tokensOutput: number;
  }[];
  byModel: {
    model: string;
    totalCost: number;
    sessions: number;
    tokensInput: number;
    tokensOutput: number;
  }[];
  byDay: { day: string; totalCost: number; sessions: number }[];
}

interface DashboardState {
  summary: DashboardSummary | null;
  periodDays: number;
  loading: boolean;
  error: string | null;
}

const initial: DashboardState = {
  summary: null,
  periodDays: 7,
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