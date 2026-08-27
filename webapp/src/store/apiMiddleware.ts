import { Middleware, MiddlewareAPI } from "redux";
import { apiFetch } from "../api/client";

type Action = { type: string; payload?: any };

export const apiMiddleware: Middleware =
  ({ dispatch }: MiddlewareAPI) =>
  (next) =>
  (action: unknown) => {
    const a = action as Action;
    if (!a.type || !a.type.endsWith("_REQUESTED")) return next(action);
    const base = a.type.replace(/_REQUESTED$/, "");
    dispatch({ type: `${base}_START`, payload: a.payload });
    const { path, method, body } = a.payload ?? {};
    apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined })
      .then((data) =>
        dispatch({ type: `${base}_SUCCESS`, payload: { data, req: a.payload } }),
      )
      .catch((err) =>
        dispatch({ type: `${base}_ERROR`, payload: { error: err, req: a.payload } }),
      );
  };