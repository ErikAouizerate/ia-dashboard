import { useEffect, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import { RootState } from "../store/store";
import { configKey, configLabel } from "../store/configs";
import { summarizeConfig } from "../lib/configSummary";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { KpiCard } from "../components/ui/KpiCard";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";

const NO_CONFIG = { configId: null, profile: null };

const euro = (n: number) => `${n.toFixed(2)} €`;
const num = (n: number) => n.toLocaleString();

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mb-4 overflow-hidden">
      <h3 className="px-4 py-3 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </Card>
  );
}

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch();
  const { data, loading, error } = useSelector((s: RootState) => s.sessionDetail);

  useEffect(() => {
    if (id)
      dispatch({
        type: "SESSION_DETAIL_LOAD_REQUESTED",
        payload: { path: `/api/sessions/${encodeURIComponent(id)}/profile` },
      });
  }, [dispatch, id]);

  if (loading && !data)
    return (
      <div className="flex items-center gap-2 p-6 text-gray-500">
        <Spinner /> Chargement…
      </div>
    );
  if (error) return <div className="p-6 text-red-700">{error}</div>;
  if (!data) return <p className="p-6">Session introuvable</p>;

  const { totals } = data;
  const cfg = data.configId || data.profile ? data : NO_CONFIG;
  const summary = summarizeConfig(data.config);

  return (
    <div>
      <Link to="/sessions" className="text-sm text-blue-600 hover:underline">
        ← Sessions
      </Link>
      <PageHeader
        title={data.session.title}
        subtitle={`${data.session.source} · ${data.session.projectName} · ${data.session.model}`}
      />
      <p className="mb-4 text-sm text-gray-600">
        Config :{" "}
        <Link to={`/configs/${configKey(cfg)}`} className="text-blue-600 hover:underline">
          {configLabel(cfg)}
        </Link>
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Coût" value={euro(totals.cost)} />
        <KpiCard label="Tokens in" value={num(totals.tokensInput)} />
        <KpiCard label="Tokens out" value={num(totals.tokensOutput)} />
        <KpiCard label="Reasoning" value={num(totals.tokensReasoning)} />
        <KpiCard label="Cache read" value={num(totals.cacheRead)} />
        <KpiCard label="Cache write" value={num(totals.cacheWrite)} />
        <KpiCard label="Appels LLM" value={String(totals.llmCalls)} />
        <KpiCard label="Appels outils" value={String(totals.toolCalls)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Par modèle">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Modèle</th>
                <th className="px-3 py-2 text-right">Appels</th>
                <th className="px-3 py-2 text-right">In</th>
                <th className="px-3 py-2 text-right">Out</th>
                <th className="px-3 py-2 text-right">Coût</th>
              </tr>
            </thead>
            <tbody>
              {data.byModel.map((m) => (
                <tr key={m.model} className="border-b border-gray-100">
                  <td className="px-3 py-2">{m.model}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.llmCalls}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(m.tokensInput)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(m.tokensOutput)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{euro(m.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.byModel.length === 0 && <EmptyState message="Aucun appel modèle." />}
        </Section>

        <Section title="Outils utilisés">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Outil</th>
                <th className="px-3 py-2 text-right">Appels</th>
                <th className="px-3 py-2 text-right">Succès</th>
                <th className="px-3 py-2 text-right">Erreurs</th>
              </tr>
            </thead>
            <tbody>
              {data.tools.map((t) => (
                <tr key={t.tool} className="border-b border-gray-100">
                  <td className="px-3 py-2">{t.tool}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.completed}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.tools.length === 0 && <EmptyState message="Aucun outil utilisé." />}
        </Section>
      </div>

      <Section title="Config">
        {summary.length > 0 && (
          <div className="grid grid-cols-2 gap-3 px-4 pb-2 md:grid-cols-4">
            {summary.map((s) => (
              <div key={s.label}>
                <div className="text-xs uppercase text-gray-500">{s.label}</div>
                <div className="text-sm font-medium text-gray-900">{s.value}</div>
              </div>
            ))}
          </div>
        )}
        {data.config ? (
          <div className="px-4 pb-4">
            <details>
              <summary className="cursor-pointer text-sm text-gray-600">JSON</summary>
              <pre className="mt-2 max-h-96 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-700">
                {JSON.stringify(data.config, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <p className="px-4 pb-4 text-sm text-gray-500">Aucune config JSON capturée.</p>
        )}
      </Section>

      <Section title={`Arbre subagents (${data.tree.length})`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2">Session</th>
              <th className="px-3 py-2">Parent</th>
              <th className="px-3 py-2">Agent</th>
              <th className="px-3 py-2">Modèle</th>
              <th className="px-3 py-2 text-right">Coût</th>
            </tr>
          </thead>
          <tbody>
            {data.tree.map((s) => (
              <tr key={s.sessionId} className="border-b border-gray-100">
                <td className="px-3 py-2">
                  <Link
                    to={`/sessions/${s.sessionId}`}
                    className="text-blue-600 hover:underline"
                  >
                    {s.sessionId}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-500">{s.parentId ?? "—"}</td>
                <td className="px-3 py-2">{s.agent ?? "—"}</td>
                <td className="px-3 py-2">{s.model}</td>
                <td className="px-3 py-2 text-right tabular-nums">{euro(s.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Appels LLM (${data.calls.length})`}>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Modèle</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2 text-right">In</th>
                <th className="px-3 py-2 text-right">Out</th>
                <th className="px-3 py-2 text-right">Cache R/W</th>
                <th className="px-3 py-2 text-right">Coût</th>
              </tr>
            </thead>
            <tbody>
              {data.calls.map((c, i) => (
                <tr key={`${c.sessionId}-${i}`} className="border-b border-gray-100">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                    {c.timeCreated ? new Date(c.timeCreated).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2">{c.model}</td>
                  <td className="px-3 py-2">{c.agent ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(c.tokensInput)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(c.tokensOutput)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {num(c.cacheRead)} / {num(c.cacheWrite)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.cost.toFixed(4)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
