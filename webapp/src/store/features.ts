interface FeaturesState {
  items: any[];
  current: any | null;
  loading: boolean;
  error: string | null;
}

const initial: FeaturesState = { items: [], current: null, loading: false, error: null };

export function featuresReducer(
  state: FeaturesState = initial,
  action: any,
): FeaturesState {
  switch (action.type) {
    case "FEATURES_LOAD_REQUESTED":
    case "FEATURE_LOAD_REQUESTED":
      return { ...state, loading: true, error: null };
    case "FEATURES_LOAD_SUCCESS":
      return { ...state, loading: false, items: action.payload.data };
    case "FEATURE_LOAD_SUCCESS":
      return { ...state, loading: false, current: action.payload.data };
    case "FEATURES_LOAD_ERROR":
    case "FEATURE_LOAD_ERROR":
      return { ...state, loading: false, error: String(action.payload.error) };
    default:
      return state;
  }
}