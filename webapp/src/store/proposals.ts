import { Proposal } from "./projects";

interface ProposalsState {
  items: Proposal[];
  loading: boolean;
  error: string | null;
}

const initial: ProposalsState = { items: [], loading: false, error: null };

export function proposalsReducer(
  state: ProposalsState = initial,
  action: any,
): ProposalsState {
  switch (action.type) {
    case "PROPOSALS_LOAD_REQUESTED":
      return { ...state, loading: true, error: null };
    case "PROPOSALS_LOAD_SUCCESS":
      return { ...state, loading: false, items: action.payload.data };
    case "PROPOSALS_LOAD_ERROR":
      return { ...state, loading: false, error: String(action.payload.error) };
    default:
      return state;
  }
}