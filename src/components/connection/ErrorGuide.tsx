import type { TranslatedError } from "@/types/server";

export function ErrorGuide({ error }: { error: TranslatedError }) {
  return (
    <div className="rounded-lg p-3 bg-red-500/5 border border-red-500/20">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-red-400 text-xs font-medium">{error.humanMsg}</span>
      </div>
      <div className="text-[11px] text-gray-500 mb-2">{error.detail}</div>
      {error.suggestions.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-gray-600 uppercase tracking-wider">建议操作</div>
          {error.suggestions.map((s, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-gray-400">
              <span className="text-yellow-500 mt-0.5 flex-shrink-0">•</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
