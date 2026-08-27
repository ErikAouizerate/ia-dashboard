import { configureStore } from "@reduxjs/toolkit";
import { apiMiddleware } from "./apiMiddleware";
import { sessionsReducer } from "./sessions";
import { featuresReducer } from "./features";

export const store = configureStore({
  reducer: { sessions: sessionsReducer, features: featuresReducer },
  middleware: (gDM) => gDM({ thunk: false }).concat(apiMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;