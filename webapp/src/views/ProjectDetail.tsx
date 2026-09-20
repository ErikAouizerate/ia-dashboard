import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import { RootState } from "../store/store";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch();
  const { current, loading, error } = useSelector((s: RootState) => s.projects);

  useEffect(() => {
    if (id) dispatch({ type: "PROJECT_LOAD_REQUESTED", payload: { path: `/api/projects/${id}` } });
  }, [dispatch, id]);

  if (loading && !current)
    return (
      <div className="flex items-center gap-2 p-6 text-gray-500">
        <Spinner /> Chargement…
      </div>
    );
  if (!current) return <p className="p-6">Projet introuvable</p>;
  if (error) return <div className="p-6 text-red-700">{error}</div>;

  return (
    <div>
      <Link to="/projects" className="text-sm text-blue-600 hover:underline">
        ← Projets
      </Link>
      <PageHeader title={current.name} subtitle={current.directory} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Coût</div>
          <div className="text-lg font-semibold tabular-nums">
            {current.totalCost.toFixed(2)} €
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Sessions</div>
          <div className="text-lg font-semibold tabular-nums">{current.sessionCount}</div>
        </Card>
      </div>
    </div>
  );
}
