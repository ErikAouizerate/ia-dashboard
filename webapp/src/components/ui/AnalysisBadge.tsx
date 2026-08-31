import { Badge } from "./Badge";

export function AnalysisBadge({ status }: { status: string }) {
  switch (status) {
    case "done":
      return <Badge tone="green">✓ analysée</Badge>;
    case "pending":
    case "analyzing":
      return <Badge tone="amber">⏳ {status}</Badge>;
    case "error":
      return <Badge tone="red">! erreur</Badge>;
    default:
      return <Badge tone="gray">non analysée</Badge>;
  }
}