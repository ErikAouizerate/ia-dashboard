import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button } from "../components/ui/Button";
import { Field, Select, TextArea, TextInput } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";

type Tab = "new" | "existing";

export function BulkLinkModal({
  sessionIds,
  alreadyLinked,
  suggestedName,
  meta,
  onClose,
  onLinked,
}: {
  sessionIds: string[];
  alreadyLinked: number;
  suggestedName: string;
  meta: { projects: string[] };
  onClose: () => void;
  onLinked: () => void;
}) {
  const [tab, setTab] = useState<Tab>("new");
  const [name, setName] = useState(suggestedName);
  const [project, setProject] = useState(meta.projects[0] ?? "");
  const [purpose, setPurpose] = useState("");
  const [satisfaction, setSatisfaction] = useState(3);
  const [features, setFeatures] = useState<any[]>([]);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featureId, setFeatureId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ linked: string[]; skipped: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "existing") return;
    let cancelled = false;
    setFeaturesLoading(true);
    api
      .features()
      .then((f) => {
        if (cancelled) return;
        setFeatures(f);
        setFeaturesLoading(false);
        if (f.length > 0) setFeatureId(f[0].id);
      })
      .catch((e: any) => {
        if (!cancelled) {
          setFeaturesLoading(false);
          setError(String(e.message ?? e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let id = featureId;
      if (tab === "new") {
        const feat = await api.createFeature({
          name: name.trim() || suggestedName,
          project,
          purpose,
          satisfaction: Number(satisfaction),
        });
        id = feat.id;
      }
      const res = await api.bulkLinkSessions(id, sessionIds);
      setResult(res);
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => (result ? onLinked() : onClose());

  return (
    <Modal
      title={`Annotate / link ${sessionIds.length} session(s)`}
      onClose={handleClose}
      footer={
        result ? (
          <Button variant="primary" onClick={onLinked}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              onClick={submit}
              disabled={busy || (tab === "existing" && featureId === "")}
              loading={busy}
            >
              Link sessions
            </Button>
          </>
        )
      }
    >
      {error && <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      {alreadyLinked > 0 && (
        <div className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-700">
          {alreadyLinked} session(s) already linked to a feature — they will be skipped.
        </div>
      )}

      {result ? (
        <div className="space-y-2 text-sm">
          <p className="text-green-700">
            <b>{result.linked.length}</b> session(s) linked.
          </p>
          <p className="text-gray-600">
            {result.skipped.length + alreadyLinked} session(s) skipped (already linked or unknown).
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <Button variant={tab === "new" ? "primary" : "secondary"} onClick={() => setTab("new")}>
              New feature
            </Button>
            <Button
              variant={tab === "existing" ? "primary" : "secondary"}
              onClick={() => setTab("existing")}
            >
              Existing feature
            </Button>
          </div>

          {tab === "new" ? (
            <div className="space-y-3">
              <Field label="Name">
                <TextInput value={name} placeholder={suggestedName} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Project">
                <Select value={project} onChange={(e) => setProject(e.target.value)}>
                  {meta.projects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Purpose">
                <TextArea value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              </Field>
              <Field label="Satisfaction (1–5)">
                <TextInput
                  type="number"
                  min={1}
                  max={5}
                  value={satisfaction}
                  onChange={(e) => setSatisfaction(Number(e.target.value))}
                />
              </Field>
            </div>
          ) : (
            <Field label="Feature">
              {featuresLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Spinner /> Loading features…
                </div>
              ) : features.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No features available yet — use the New feature tab.
                </p>
              ) : (
                <Select value={featureId} onChange={(e) => setFeatureId(e.target.value)}>
                  {features.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} — {f.project}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </>
      )}
    </Modal>
  );
}