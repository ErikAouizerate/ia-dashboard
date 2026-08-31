import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { RootState } from "../store/store";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { formatDuration } from "../lib/format";

export function ProjectsView() {
  const dispatch = useDispatch();
  const { items, loading, error } = useSelector((s: RootState) => s.projects);

  useEffect(() => {
    dispatch({ type: "PROJECTS_LOAD_REQUESTED", payload: { path: "/api/projects" } });
  }, [dispatch]);

  return (
    <div>
      <PageHeader title="Projets" subtitle={`${items.length} projets`} />
      {error && (
        <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>
      )}
      {items.length === 0 && !loading ? (
        <EmptyState message="Aucun projet dérivé des sessions." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="block">
              <Card className="p-4 transition hover:border-gray-300 hover:shadow">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-gray-900">{p.name}</span>
                  {p.stale && <span className="text-xs text-amber-600">stale</span>}
                </div>
                <div className="mt-1 truncate text-sm text-gray-500" title={p.directory}>
                  {p.directory}
                </div>
                <div className="mt-1 text-sm text-gray-700">
                  {p.sessionCount} sessions · {p.totalCost.toFixed(2)} € ·{" "}
                  {p.tokensInput.toLocaleString()} tok · {formatDuration(p.durationMs)}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {loading && <p className="mt-2 text-sm text-gray-500">Chargement…</p>}
    </div>
  );
}