import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import { RootState } from "../store/store";
import { configLabel } from "../store/configs";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";

export function ConfigDetail() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch();
  const { current, loading, error } = useSelector((s: RootState) => s.configs);

  useEffect(() => {
    if (id)
      dispatch({
        type: "CONFIG_LOAD_REQUESTED",
        payload: { path: `/api/configs/${encodeURIComponent(id)}` },
      });
  }, [dispatch, id]);

  if (loading && !current)
    return (
      <div className="flex items-center gap-2 p-6 text-gray-500">
        <Spinner /> Chargement…
      </div>
    );
  if (error) return <div className="p-6 text-red-700">{error}</div>;
  if (!current) return <p className="p-6">Config introuvable</p>;

  return (
    <div>
      <Link to="/configs" className="text-sm text-blue-600 hover:underline">
        ← Configs
      </Link>
      <PageHeader
        title={configLabel(current)}
        subtitle={current.configId ?? "aucune config capturée pour ces sessions"}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Sessions</div>
          <div className="text-lg font-semibold tabular-nums">{current.sessions}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Coût</div>
          <div className="text-lg font-semibold tabular-nums">{current.totalCost.toFixed(2)} €</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Tokens</div>
          <div className="text-lg font-semibold tabular-nums">
            {(current.tokensInput + current.tokensOutput).toLocaleString()}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Modèles</div>
          <div className="text-lg font-semibold tabular-nums">{current.models.length}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Modèles</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-1">Modèle</th>
                <th className="py-1 text-right">Sessions</th>
                <th className="py-1 text-right">Coût</th>
              </tr>
            </thead>
            <tbody>
              {current.models.map((m) => (
                <tr key={m.model} className="border-t border-gray-100">
                  <td className="py-1">{m.model}</td>
                  <td className="py-1 text-right tabular-nums">{m.sessions}</td>
                  <td className="py-1 text-right tabular-nums">{m.totalCost.toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Config</h3>
          {current.config ? (
            <details>
              <summary className="cursor-pointer text-sm text-gray-600">JSON</summary>
              <pre className="mt-2 max-h-96 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-700">
                {JSON.stringify(current.config, null, 2)}
              </pre>
            </details>
          ) : (
            <p className="text-sm text-gray-500">Aucune config JSON capturée.</p>
          )}
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <h3 className="p-4 pb-2 text-sm font-semibold text-gray-900">Sessions</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Projet</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {current.sessionList.map((s) => (
              <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="max-w-xs truncate px-3 py-2" title={s.title}>
                  <Link
                    to={`/sessions/${s.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {s.title}
                  </Link>
                </td>
                <td className="px-3 py-2">{s.projectName}</td>
                <td className="px-3 py-2 text-gray-600">{s.source}</td>
                <td className="px-3 py-2">{s.model}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {s.timeCreated ? new Date(s.timeCreated).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{s.cost.toFixed(2)} €</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
