import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { RootState } from "../store/store";
import { configKey, configLabel } from "../store/configs";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";

export function ConfigView() {
  const dispatch = useDispatch();
  const { items, loading, error } = useSelector((s: RootState) => s.configs);

  useEffect(() => {
    dispatch({ type: "CONFIGS_LOAD_REQUESTED", payload: { path: "/api/configs" } });
  }, [dispatch]);

  return (
    <div>
      <PageHeader title="Configs" subtitle={`${items.length} configs`} />
      {error && (
        <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>
      )}
      {items.length === 0 && !loading ? (
        <EmptyState message="Aucune config capturée." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Config</th>
                <th className="px-3 py-2">ConfigId</th>
                <th className="px-3 py-2">Modèles</th>
                <th className="px-3 py-2 text-right">Sessions</th>
                <th className="px-3 py-2 text-right">Coût</th>
                <th className="px-3 py-2 text-right">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={configKey(c)} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link
                      to={`/configs/${configKey(c)}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {configLabel(c)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">
                    {c.configId ? c.configId.slice(0, 10) : "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {c.models.map((m) => m.model).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.sessions}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.totalCost.toFixed(2)} €</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {(c.tokensInput + c.tokensOutput).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
              <Spinner /> Chargement…
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
