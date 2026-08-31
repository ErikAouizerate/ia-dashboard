export function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{value}</div>
      {sub && <div className="text-sm text-gray-500">{sub}</div>}
    </div>
  );
}