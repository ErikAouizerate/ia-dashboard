import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { RootState } from "../store/store";
import { FeatureForm } from "./FeatureForm";

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

  if (loading && !current) return <p className="p-6">Loading…</p>;
  if (!current) return <p className="p-6">Not found</p>;
  if (error) return <div className="p-6 text-red-700">{error}</div>;

  return (
    <div className="p-6">
      <Link to="/features" className="text-blue-600">
        ← Back
      </Link>
      <h1 className="mb-2 mt-2 text-xl font-semibold">{current.name}</h1>
      <div className="mb-4 text-sm text-gray-600">
        <p>
          Project: <b>{current.project}</b> · Status: {current.status}
        </p>
        {current.purpose && <p>Purpose: {current.purpose}</p>}
        {current.timeSpentMin != null && (
          <p>Time spent: {current.timeSpentMin} min</p>
        )}
        {current.satisfaction && <p>Satisfaction: ★{current.satisfaction}</p>}
        {current.comment && <p>Comment: {current.comment}</p>}
        {current.tags?.length > 0 && <p>Tags: {current.tags.join(", ")}</p>}
      </div>
      <FeatureForm feature={current} />
      <h2 className="mb-2 mt-6 text-lg font-semibold">Linked sessions</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th>Title</th>
            <th>Model</th>
            <th>Cost</th>
            <th>In/Out</th>
            <th>Date</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {current.sessions.map((s: any) => (
            <tr key={s.id} className="border-t">
              <td className="max-w-xs truncate" title={s.title}>
                {s.title}
              </td>
              <td>{s.model}</td>
              <td>{Number(s.cost ?? 0).toFixed(2)} €</td>
              <td>
                {s.tokensInput} / {s.tokensOutput}
              </td>
              <td>{s.timeCreated ? new Date(s.timeCreated).toLocaleDateString() : "—"}</td>
              <td>
                <button
                  className="text-blue-600"
                  onClick={async () => {
                    await api.resyncSession(current.id, s.sessionId);
                    reload();
                  }}
                >
                  resync
                </button>
                <button
                  className="ml-2 text-red-600"
                  onClick={async () => {
                    await api.unlinkSession(current.id, s.sessionId);
                    reload();
                  }}
                >
                  unlink
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}