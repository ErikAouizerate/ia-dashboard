import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import { RootState } from "../store/store";
import { api } from "../api/client";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { TextInput } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";

function ProposalCard({ proposal, onChanged }: { proposal: any; onChanged: () => void }) {
  const [name, setName] = useState(proposal.name);
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    await api.acceptProposal(proposal.id, { name });
    setBusy(false);
    onChanged();
  };
  const dismiss = async () => {
    setBusy(true);
    await api.dismissProposal(proposal.id);
    setBusy(false);
    onChanged();
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <TextInput
          className="max-w-sm font-semibold"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex gap-2">
          <Button variant="danger" onClick={dismiss} disabled={busy}>
            Écarter
          </Button>
          <Button variant="primary" onClick={accept} disabled={busy} loading={busy}>
            Accepter
          </Button>
        </div>
      </div>
      {proposal.purpose && <p className="mt-2 text-sm text-gray-600">{proposal.purpose}</p>}
      {proposal.rationale && (
        <p className="mt-1 text-xs text-gray-400">{proposal.rationale}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {proposal.sessionIds.map((sid: string) => (
          <span
            key={sid}
            className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
          >
            {sid.slice(0, 8)}
          </span>
        ))}
      </div>
    </Card>
  );
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch();
  const { current, loading, error } = useSelector((s: RootState) => s.projects);

  const reload = () =>
    dispatch({ type: "PROJECT_LOAD_REQUESTED", payload: { path: `/api/projects/${id}` } });

  useEffect(() => {
    if (id) dispatch({ type: "PROJECT_LOAD_REQUESTED", payload: { path: `/api/projects/${id}` } });
  }, [dispatch, id]);

  const recluster = async () => {
    if (id) await api.runProjectClustering(id);
    reload();
  };

  if (loading && !current)
    return (
      <div className="flex items-center gap-2 p-6 text-gray-500">
        <Spinner /> Chargement…
      </div>
    );
  if (!current) return <p className="p-6">Projet introuvable</p>;
  if (error) return <div className="p-6 text-red-700">{error}</div>;

  const pending = current.proposals.filter((p) => p.status === "pending");

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
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Features</div>
          <div className="text-lg font-semibold tabular-nums">{current.features.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500">Non groupées</div>
          <div className="text-lg font-semibold tabular-nums">{current.ungroupedSessions}</div>
        </Card>
      </div>

      <div className="mb-4 flex justify-end">
        <Button variant="secondary" onClick={recluster}>
          Reclustering du projet
        </Button>
      </div>

      <h2 className="mb-2 mt-6 text-lg font-semibold">Propositions de features</h2>
      {pending.length === 0 && (
        <p className="mb-2 text-sm text-gray-500">Aucune proposition en attente.</p>
      )}
      <div className="space-y-3">
        {pending.map((p) => (
          <ProposalCard key={p.id} proposal={p} onChanged={reload} />
        ))}
      </div>

      <h2 className="mb-2 mt-6 text-lg font-semibold">Features</h2>
      <div className="space-y-2">
        {current.features.map((f) => (
          <Link key={f.id} to={`/features/${f.id}`} className="block">
            <Card className="p-3 transition hover:border-gray-300">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">{f.name}</span>
                <span className="text-sm text-gray-500">{f.demandes?.length ?? 0} demandes</span>
              </div>
              {f.purpose && <p className="mt-1 text-sm text-gray-600">{f.purpose}</p>}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}