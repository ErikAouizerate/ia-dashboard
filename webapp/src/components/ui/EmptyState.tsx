export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-gray-500">
      <p className="text-sm">{message}</p>
    </div>
  );
}