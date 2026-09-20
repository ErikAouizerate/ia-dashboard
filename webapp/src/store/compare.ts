export interface CompareState {
  data: any | null;
  loading: boolean;
  error: string | null;
}

const initial: CompareState = { data: null, loading: false, error: null };

export function compareReducer(state: CompareState = initial, action: any): CompareState {
  switch (action.type) {
    case "COMPARE_LOAD_REQUESTED":
      return { ...state, loading: true, error: null };
    case "COMPARE_LOAD_SUCCESS":
      return { ...state, loading: false, data: action.payload.data };
    case "COMPARE_LOAD_ERROR":
      return { ...state, loading: false, error: String(action.payload.error) };
    default:
      return state;
  }
}
