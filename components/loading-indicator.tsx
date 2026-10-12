import { LoaderCircle } from "lucide-react";
export function LoadingIndicator({ label }: { label: string }) {
  return (
    <span className="loading-indicator" role="status">
      <LoaderCircle className="loading-spinner" size={20} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
