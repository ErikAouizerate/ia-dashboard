import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { RootState } from "../store/store";
import { FeatureForm } from "./FeatureForm";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";

export function FeatureDetail() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch();
  const { current, loading, error } = useSelector((s: RootState) => s.features);

  useEffect(() => {
    if (id) {
      dispatch({ type: "FEATURE_LOAD_REQUESTED", payload: { path: `/api/features/${id}` } });
    }
  }, [dispatch, id]);

  const reload = () =>
    dispatch({
      type: "FEATURE_LOAD_REQUESTED",
      payload: { path: `/api/features/${current.id}` },
    });

  if (loading && !current)
    return (
      <div className="flex items-center gap-2 p-6 text-gray-500">
        <Spinner /> Loading…
      </div>
    );
  if (!current) return <p className="p-6">Not found</p>;
  if (error) return <div className="p-6 text-red-700">{error}</div>;

  const totalCost = current.sessions.reduce((a: number, s: any) => a + Number(s.cost ?? 0), 0);
  const totalIn = current.sessions.reduce((a: number, s: any) => a + Number(s.tokensInput ?? 0), 0);
  const totalOut = current.sessions.reduce((a: number, s: any) => a + Number(s.tokensOutput ?? 0), 0);

  return (
    <div>
      <Link to="/features" className="text-sm text-blue-600 hover:underline">
        ← Back
      </Link>
      <PageHeader title={current.name} subtitle={`${current.project} · ${current.status}`} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Total cost</div>
          <div className="text-lg font-semibold tabular-nums">{totalCost.toFixed(2)} €</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Tokens in</div>
          <div className="text-lg font-semibold tabular-nums">{totalIn}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Tokens out</div>
          <div className="text-lg font-semibold tabular-nums">{totalOut}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Sessions</div>
          <div className="text-lg font-semibold tabular-nums">{current.sessions.length}</div>
        </Card>
      </div>
      {current.purpose && (
        <p className="mb-4 text-sm text-gray-700">
          <b>Purpose:</b> {current.purpose}
        </p>
      )}
      {current.satisfaction && (
        <p className="mb-4 text-sm text-gray-700">
          <b>Satisfaction:</b> ★{current.satisfaction}
        </p>
      )}
      {current.timeSpentMin != null && (
        <p className="mb-4 text-sm text-gray-700">
          <b>Time spent:</b> {current.timeSpentMin} min
        </p>
      )}
      {current.comment && (
        <p className="mb-4 text-sm text-gray-700">
          <b>Comment:</b> {current.comment}
        </p>
      )}
      {current.tags?.length > 0 && (
        <p className="mb-4 text-sm text-gray-700">
          <b>Tags:</b> {current.tags.join(", ")}
        </p>
      )}
      <FeatureForm feature={current} />
      <h2 className="mb-2 mt-6 text-lg font-semibold">Linked sessions</h2>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">In/Out</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {current.sessions.map((s: any) => (
              <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="max-w-xs truncate px-3 py-2" title={s.title}>
                  {s.title}
                </td>
                <td className="px-3 py-2">{s.model}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {Number(s.cost ?? 0).toFixed(2)} €
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {s.tokensInput} / {s.tokensOutput}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {s.timeCreated ? new Date(s.timeCreated).toLocaleDateString() : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await api.resyncSession(current.id, s.sessionId);
                      reload();
                    }}
                  >
                    resync
                  </Button>
                  <Button
                    variant="danger"
                    className="ml-1"
                    onClick={async () => {
                      await api.unlinkSession(current.id, s.sessionId);
                      reload();
                    }}
                  >
                    unlink
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {current.sessions.length === 0 && <EmptyState message="No linked sessions yet." />}
      </Card>
    </div>
  );
}