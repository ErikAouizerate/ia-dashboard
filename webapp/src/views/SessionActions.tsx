import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { api } from "../api/client";
import { RootState } from "../store/store";
import { SessionRow } from "../store/sessions";

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
    <div className="fixed inset-0 flex justify-end bg-black/30">
      <div className="h-full w-96 overflow-y-auto bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Annotate session</h2>
        <p className="mb-4 truncate text-sm text-gray-500" title={session.title}>
          {session.title}
        </p>
        {error && <div className="mb-2 rounded bg-red-100 p-2 text-red-700">{error}</div>}
        {done ? (
          <p className="text-green-700">
            Session linked to feature <b>{name || session.title}</b>.
          </p>
        ) : session.annotated ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Already annotated — feature <code>{session.featureId}</code>.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded px-3 py-1 text-gray-600"
              >
                Close
              </button>
              <button
                onClick={resync}
                disabled={busy}
                className="rounded bg-gray-200 px-3 py-1"
              >
                {busy ? "Working…" : "Resync snapshot"}
              </button>
              <button
                onClick={unlink}
                disabled={busy}
                className="rounded bg-red-600 px-3 py-1 text-white"
              >
                Unlink
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="block">Name</label>
            <input
              className="mb-2 w-full rounded border px-2 py-1"
              value={name}
              placeholder={session.title}
              onChange={(e) => setName(e.target.value)}
            />
            <label className="block">Project</label>
            <select
              className="mb-2 w-full rounded border px-2 py-1"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              {meta.projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <label className="block">Purpose</label>
            <textarea
              className="mb-2 w-full rounded border px-2 py-1"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
            <label className="block">Satisfaction (1–5)</label>
            <input
              type="number"
              min={1}
              max={5}
              className="mb-4 w-full rounded border px-2 py-1"
              value={satisfaction}
              onChange={(e) => setSatisfaction(Number(e.target.value))}
            />
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded px-3 py-1 text-gray-600">
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={createAndLink}
                className="rounded bg-blue-600 px-3 py-1 text-white"
              >
                {busy ? "Saving…" : "Create & link"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}