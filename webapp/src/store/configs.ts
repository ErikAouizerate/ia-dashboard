export interface ConfigModelStat {
  model: string;
  sessions: number;
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
}

export interface ConfigRow {
  configId: string | null;
  profile: string | null;
  config: unknown | null;
  sessions: number;
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
  bySource: { source: string; sessions: number; totalCost: number }[];
  models: ConfigModelStat[];
}

export interface ConfigSession {
  id: string;
  title: string;
  source: string;
  model: string;
  cost: number;
  tokensInput: number;
  tokensOutput: number;
  timeCreated: number;
  projectName: string;
}

export interface ConfigDetailData extends ConfigRow {
  sessionList: ConfigSession[];
}

export const NO_CONFIG_ID = "none";

export const configKey = (c: { configId: string | null }) => c.configId ?? NO_CONFIG_ID;

export const configLabel = (c: { configId: string | null; profile: string | null }) =>
  c.profile ?? (c.configId ? c.configId.slice(0, 10) : "sans config");

interface ConfigsState {
  items: ConfigRow[];
  current: ConfigDetailData | null;
  loading: boolean;
  error: string | null;
}

const initial: ConfigsState = { items: [], current: null, loading: false, error: null };

export function configsReducer(state: ConfigsState = initial, action: any): ConfigsState {
  switch (action.type) {
    case "CONFIGS_LOAD_REQUESTED":
    case "CONFIG_LOAD_REQUESTED":
      return { ...state, loading: true, error: null };
    case "CONFIGS_LOAD_SUCCESS":
      return { ...state, loading: false, items: action.payload.data };
    case "CONFIG_LOAD_SUCCESS":
      return { ...state, loading: false, current: action.payload.data };
    case "CONFIGS_LOAD_ERROR":
    case "CONFIG_LOAD_ERROR":
      return { ...state, loading: false, error: String(action.payload.error) };
    default:
      return state;
  }
}
