import { useState } from "react";
import { useDispatch } from "react-redux";
import { api } from "../api/client";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, TextArea, TextInput } from "../components/ui/Field";

export function FeatureForm({ feature }: { feature: any }) {
  const dispatch = useDispatch();
  const [name, setName] = useState(feature.name);
  const [purpose, setPurpose] = useState(feature.purpose ?? "");
  const [satisfaction, setSatisfaction] = useState(
    feature.satisfaction != null ? String(feature.satisfaction) : "",
  );
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
      comment,
      timeSpentMin: timeSpentMin === "" ? null : Number(timeSpentMin),
    });
    setBusy(false);
    setSaved(true);
    reload();
  };

  return (
    <Card className="mb-6 max-w-lg p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" className="col-span-2">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Purpose" className="col-span-2">
          <TextArea value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </Field>
        <Field label="Satisfaction (1–5)">
          <TextInput
            type="number"
            min={1}
            max={5}
            value={satisfaction}
            onChange={(e) => setSatisfaction(e.target.value)}
          />
        </Field>
        <Field label="Time spent (min)" className="col-span-2">
          <TextInput
            type="number"
            value={timeSpentMin}
            onChange={(e) => setTimeSpentMin(e.target.value)}
          />
        </Field>
        <Field label="Comment" className="col-span-2">
          <TextArea value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <div className="col-span-2 flex items-center gap-3">
          <Button variant="primary" onClick={submit} disabled={busy} loading={busy}>
            Save
          </Button>
          {saved && <span className="text-sm text-green-700">Saved.</span>}
        </div>
      </div>
    </Card>
  );
}