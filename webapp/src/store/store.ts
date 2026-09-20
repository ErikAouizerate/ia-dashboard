import { configureStore } from "@reduxjs/toolkit";
import { apiMiddleware } from "./apiMiddleware";
import { sessionsReducer } from "./sessions";
import { featuresReducer } from "./features";
import { dashboardReducer } from "./dashboard";
import { projectsReducer } from "./projects";
import { proposalsReducer } from "./proposals";
import { compareReducer } from "./compare";

export const store = configureStore({
  reducer: {
    sessions: sessionsReducer,
    features: featuresReducer,
    dashboard: dashboardReducer,
    projects: projectsReducer,
    proposals: proposalsReducer,
    compare: compareReducer,
  },
  middleware: (gDM) =>
    gDM({ thunk: false, serializableCheck: false }).concat(apiMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;