import { Link } from "react-router-dom";

export function BarList({
  rows,
  valueOf,
  labelOf,
  to,
  valueSuffix = "€",
  formatValue = (n: number) => n.toFixed(2),
  stackOf,
}: {
  rows: any[];
  valueOf: (r: any) => number;
  labelOf: (r: any) => string;
  to?: (r: any) => string | undefined;
  valueSuffix?: string;
  formatValue?: (n: number) => string;
  stackOf?: (r: any) => Array<{ value: number; className: string }>;
}) {
  const max = Math.max(1, ...rows.map(valueOf));
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const href = to?.(r);
        const segments = stackOf?.(r);
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-40 truncate text-sm text-gray-700" title={labelOf(r)}>
              {href ? (
                <Link className="text-blue-600 hover:underline" to={href}>
                  {labelOf(r)}
                </Link>
              ) : (
                labelOf(r)
              )}
            </div>
            <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100">
              {segments ? (
                <div className="flex h-full">
                  {segments.map((seg, j) => (
                    <div
                      key={j}
                      className={`h-full ${seg.className}`}
                      style={{ width: `${(seg.value / max) * 100}%` }}
                    />
                  ))}
                </div>
              ) : (
                <div
                  className="h-full rounded bg-blue-500"
                  style={{ width: `${(valueOf(r) / max) * 100}%` }}
                />
              )}
            </div>
            <div className="w-20 text-right text-sm tabular-nums text-gray-700">
              {formatValue(valueOf(r))} {valueSuffix}
            </div>
          </div>
        );
      })}
    </div>
  );
}