import { Link } from "react-router-dom";

export function BarList({
  rows,
  valueOf,
  labelOf,
  to,
  valueSuffix = "€",
}: {
  rows: any[];
  valueOf: (r: any) => number;
  labelOf: (r: any) => string;
  to?: (r: any) => string | undefined;
  valueSuffix?: string;
}) {
  const max = Math.max(1, ...rows.map(valueOf));
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const href = to?.(r);
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
              <div
                className="h-full rounded bg-blue-500"
                style={{ width: `${(valueOf(r) / max) * 100}%` }}
              />
            </div>
            <div className="w-20 text-right text-sm tabular-nums text-gray-700">
              {valueOf(r).toFixed(2)} {valueSuffix}
            </div>
          </div>
        );
      })}
    </div>
  );
}