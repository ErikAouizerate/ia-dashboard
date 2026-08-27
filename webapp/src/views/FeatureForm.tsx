import { useState } from "react";
import { useDispatch } from "react-redux";
import { api } from "../api/client";

export function FeatureForm({ feature }: { feature: any }) {
  const dispatch = useDispatch();
  const [name, setName] = useState(feature.name);
  const [purpose, setPurpose] = useState(feature.purpose ?? "");
  const [satisfaction, setSatisfaction] = useState(
    feature.satisfaction != null ? String(feature.satisfaction) : "",
  );
  const [status, setStatus] = useState(feature.status);
  const [comment, setComment] = useState(feature.comment ?? "");
  const [timeSpentMin, setTimeSpentMin] = useState(
    feature.timeSpentMin != null ? String(feature.timeSpentMin) : "",
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const reload = () =>
    dispatch({
      type: "FEATURE_LOAD_REQUESTED",
      payload: { path: `/api/features/${feature.id}` },
    });

  const submit = async () => {
    setBusy(true);
    await api.updateFeature(feature.id, {
      name,
      purpose,
      satisfaction: satisfaction === "" ? null : Number(satisfaction),
      status,
      comment,
      timeSpentMin: timeSpentMin === "" ? null : Number(timeSpentMin),
    });
    setBusy(false);
    setSaved(true);
    reload();
  };

  return (
    <div className="grid max-w-lg grid-cols-2 gap-3 rounded border p-4">
      <label className="col-span-2">
        Name
        <input
          className="w-full rounded border px-2 py-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="col-span-2">
        Purpose
        <textarea
          className="w-full rounded border px-2 py-1"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </label>
      <label>
        Status
        <select
          className="w-full rounded border px-2 py-1"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option>planned</option>
          <option>in_progress</option>
          <option>done</option>
          <option>abandoned</option>
        </select>
      </label>
      <label>
        Satisfaction (1–5)
        <input
          type="number"
          min={1}
          max={5}
          className="w-full rounded border px-2 py-1"
          value={satisfaction}
          onChange={(e) => setSatisfaction(e.target.value)}
        />
      </label>
      <label className="col-span-2">
        Time spent (min)
        <input
          type="number"
          className="w-full rounded border px-2 py-1"
          value={timeSpentMin}
          onChange={(e) => setTimeSpentMin(e.target.value)}
        />
      </label>
      <label className="col-span-2">
        Comment
        <textarea
          className="w-full rounded border px-2 py-1"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
      <div className="col-span-2 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded bg-blue-600 px-3 py-1 text-white"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-green-700">Saved.</span>}
      </div>
    </div>
  );
}