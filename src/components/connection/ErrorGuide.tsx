import type { TranslatedError } from "@/types/server";

export function ErrorGuide({ error }: { error: TranslatedError }) {
  return (
    <div className="rounded-lg p-3 bg-danger-soft border border-danger/20">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-helper text-danger font-medium">{error.humanMsg}</span>
      </div>
      <div className="text-label text-tertiary mb-2">{error.detail}</div>
      {error.suggestions.length > 0 && (
        <div className="space-y-1">
          <div className="text-label text-disabled uppercase tracking-wider">建议操作</div>
          {error.suggestions.map((s, i) => (
            <div key={i} className="flex items-start gap-1.5 text-helper text-secondary">
              <span className="text-warning mt-0.5 flex-shrink-0">•</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
