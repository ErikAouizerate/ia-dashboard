import { configureStore } from "@reduxjs/toolkit";
import { apiMiddleware } from "./apiMiddleware";
import { sessionsReducer } from "./sessions";
import { dashboardReducer } from "./dashboard";
import { projectsReducer } from "./projects";
import { configsReducer } from "./configs";
import { compareReducer } from "./compare";

export const store = configureStore({
  reducer: {
    sessions: sessionsReducer,
    dashboard: dashboardReducer,
    projects: projectsReducer,
    configs: configsReducer,
    compare: compareReducer,
  },
  middleware: (gDM) =>
    gDM({ thunk: false, serializableCheck: false }).concat(apiMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;