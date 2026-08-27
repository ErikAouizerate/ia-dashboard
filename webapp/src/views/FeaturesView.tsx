import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { RootState } from "../store/store";

export function FeaturesView() {
  const dispatch = useDispatch();
  const { items, loading, error } = useSelector((s: RootState) => s.features);

  useEffect(() => {
    dispatch({ type: "FEATURES_LOAD_REQUESTED", payload: { path: "/api/features" } });
  }, [dispatch]);

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Features</h1>
      {error && (
        <div className="mb-2 rounded bg-red-100 p-2 text-red-700">{error}</div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((f) => (
          <Link
            key={f.id}
            to={`/features/${f.id}`}
            className="rounded border p-4 hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{f.name}</span>
              <span className="text-xs uppercase text-gray-500">{f.status}</span>
            </div>
            <div className="mt-1 text-sm text-gray-600">
              {f.project} · {f.sessionCount} sessions
            </div>
            <div className="mt-1 text-sm">
              {Number(f.totalCost ?? 0).toFixed(2)} € · {f.totalTokensInput} /{" "}
              {f.totalTokensOutput} tok
              {f.satisfaction ? ` · ★${f.satisfaction}` : ""}
            </div>
          </Link>
        ))}
      </div>
      {loading && <p>Loading…</p>}
    </div>
  );
}