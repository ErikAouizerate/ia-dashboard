import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { api } from "../api/client";
import { RootState } from "../store/store";
import { SessionRow } from "../store/sessions";
import { Button } from "../components/ui/Button";
import { Field, Select, TextArea, TextInput } from "../components/ui/Field";

function refreshSessions(dispatch: (a: any) => void) {
  dispatch({
    type: "SESSIONS_LOAD_REQUESTED",
    payload: { path: "/api/sessions?page=1", filters: {} },
  });
}

export function SessionActions({
  session,
  onClose,
}: {
  session: SessionRow;
  onClose: () => void;
}) {
  const dispatch = useDispatch();
  const meta = useSelector((s: RootState) => s.sessions.meta);
  const [name, setName] = useState("");
  const [project, setProject] = useState(meta.projects[0] ?? "");
  const [purpose, setPurpose] = useState("");
  const [satisfaction, setSatisfaction] = useState(3);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createAndLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const feat = await api.createFeature({
        name: name || session.title,
        project,
        purpose,
        satisfaction: Number(satisfaction),
      });
      await api.linkSession(feat.id, session.id);
      setDone(true);
      refreshSessions(dispatch);
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    setError(null);
    try {
      if (session.featureId) {
        await api.unlinkSession(session.featureId, session.id);
      }
      refreshSessions(dispatch);
      onClose();
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const resync = async () => {
    setBusy(true);
    setError(null);
    try {
      if (session.featureId) {
        await api.resyncSession(session.featureId, session.id);
      }
      refreshSessions(dispatch);
      onClose();
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="h-full w-96 overflow-y-auto bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Annotate session</h2>
        <p className="mb-4 truncate text-sm text-gray-500" title={session.title}>
          {session.title}
        </p>
        {error && (
          <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>
        )}
        {done ? (
          <p className="text-green-700">
            Session linked to feature <b>{name || session.title}</b>.
          </p>
        ) : session.annotated ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              Already annotated — feature <code>{session.featureId}</code>.
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={onClose}>Close</Button>
              <Button onClick={resync} disabled={busy} loading={busy}>
                Resync snapshot
              </Button>
              <Button variant="danger" onClick={unlink} disabled={busy} loading={busy}>
                Unlink
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Field label="Name">
              <TextInput
                className="mb-2"
                value={name}
                placeholder={session.title}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Project">
              <Select
                className="mb-2"
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                {meta.projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Purpose">
              <TextArea className="mb-2" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </Field>
            <Field label="Satisfaction (1–5)">
              <TextInput
                type="number"
                min={1}
                max={5}
                className="mb-4"
                value={satisfaction}
                onChange={(e) => setSatisfaction(Number(e.target.value))}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={createAndLink} disabled={busy} loading={busy}>
                Create & link
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}