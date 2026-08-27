import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { RootState } from "../store/store";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { TextInput } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";

const statusTone: Record<string, "gray" | "green" | "blue" | "amber" | "red"> = {
  planned: "gray",
  in_progress: "blue",
  done: "green",
  abandoned: "red",
};

export function FeaturesView() {
  const dispatch = useDispatch();
  const { items, loading, error } = useSelector((s: RootState) => s.features);
  const [q, setQ] = useState("");

  useEffect(() => {
    dispatch({ type: "FEATURES_LOAD_REQUESTED", payload: { path: "/api/features" } });
  }, [dispatch]);

  const filtered = useMemo(
    () => items.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase())),
    [items, q],
  );

  return (
    <div>
      <PageHeader title="Features" subtitle={`${items.length} features`} />
      {error && (
        <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>
      )}
      <div className="mb-4 max-w-sm">
        <TextInput
          placeholder="Search by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {filtered.length === 0 && !loading ? (
        <EmptyState message="No features." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((f) => (
            <Link key={f.id} to={`/features/${f.id}`} className="block">
              <Card className="p-4 transition hover:border-gray-300 hover:shadow">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-gray-900">{f.name}</span>
                  <Badge tone={statusTone[f.status] ?? "gray"}>{f.status}</Badge>
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  {f.project} · {f.sessionCount} sessions
                </div>
                <div className="mt-1 text-sm text-gray-700">
                  {Number(f.totalCost ?? 0).toFixed(2)} € · {f.totalTokensInput} /{" "}
                  {f.totalTokensOutput} tok
                  {f.satisfaction ? ` · ★${f.satisfaction}` : ""}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {loading && <p className="mt-2 text-sm text-gray-500">Loading…</p>}
    </div>
  );
}