import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { HistoryEntry } from '@/electron';
import { History } from 'lucide-react';
import { memo } from 'react';
import { formatHistoryDate } from './utils';

function confidenceBadgeClass(bucket?: HistoryEntry['confidenceBucket']) {
  if (bucket === 'high') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (bucket === 'medium') return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
  return 'bg-rose-500/10 text-rose-700 dark:text-rose-400';
}

type HistoryTabProps = {
  hasDesktopApi: boolean;
  historyBusy: boolean;
  historyEntries: HistoryEntry[];
  historyLoading: boolean;
  historyQuery: string;
  onClearHistory: () => void;
  onCopyHistoryEntry: (entry: HistoryEntry) => void;
  onRefreshHistory: () => void;
  onRemoveHistoryEntry: (id: string) => void;
  onSetHistoryQuery: (value: string) => void;
};

const HistoryTab = memo(function HistoryTab({
  hasDesktopApi,
  historyBusy,
  historyEntries,
  historyLoading,
  historyQuery,
  onClearHistory,
  onCopyHistoryEntry,
  onRefreshHistory,
  onRemoveHistoryEntry,
  onSetHistoryQuery,
}: HistoryTabProps) {
  return (
    <Card className="flex h-full flex-col overflow-hidden border-border bg-card shadow-sm">
      <CardHeader className="border-b border-border/40 bg-muted/20 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-medium text-foreground">Histórico local</CardTitle>
            <CardDescription className="text-muted-foreground mt-1">
              Revise sessões anteriores, copie trechos úteis e limpe o que não precisa mais.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Buscar no histórico..."
              value={historyQuery}
              onChange={(e) => onSetHistoryQuery(e.target.value)}
              disabled={!hasDesktopApi || historyLoading}
              className="h-10 w-[200px] rounded-xl border-border/50 bg-background px-4 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              variant="outline"
              className="h-10 rounded-xl border-border/50 bg-transparent hover:bg-muted"
              onClick={onRefreshHistory}
              disabled={!hasDesktopApi || historyLoading}
            >
              {historyLoading ? 'Buscando...' : 'Atualizar'}
            </Button>
            <Button
              variant="ghost"
              className="h-10 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-400/10"
              onClick={onClearHistory}
              disabled={!hasDesktopApi || historyBusy}
            >
              Limpar histórico
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <div className="custom-scrollbar max-h-[500px] w-full overflow-y-auto p-6 space-y-4">
          {historyEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-border/50 bg-muted/10 px-6 py-16 text-center">
              <History className="mb-4 h-12 w-12 text-muted-foreground/30" />
              <div className="text-base font-medium text-muted-foreground">
                Nenhum ditado encontrado
              </div>
              <div className="mt-1 text-sm text-muted-foreground/80">
                Quando você salvar transcrições, elas aparecerão aqui para consulta rápida.
              </div>
            </div>
          ) : (
            historyEntries.map((entry) => (
              <div
                key={entry.id}
                className="group relative rounded-[24px] border border-border/40 bg-muted/20 p-5 transition-all hover:border-border hover:bg-muted/60"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <span className="rounded-md bg-muted-foreground/10 px-2 py-1 text-foreground/80">
                        {formatHistoryDate(entry.createdAt)}
                      </span>
                      <span className="flex items-center gap-1.5 rounded-full border border-border/40 bg-background px-2.5 py-1">
                        <div
                          className={`h-1.5 w-1.5 rounded-full ${entry.pasted ? 'bg-emerald-500/70' : 'bg-blue-500/70'}`}
                        />
                        {entry.pasted ? 'Inserção automática' : 'Uso manual'}
                      </span>
                      <span>
                        {Math.max(1, Math.round(entry.sessionDurationMs / 1000))}s de captura
                      </span>
                      {entry.intent ? (
                        <span className="rounded-full border border-border/40 bg-background px-2.5 py-1">
                          {entry.intent}
                        </span>
                      ) : null}
                      {entry.confidenceBucket ? (
                        <span
                          className={`rounded-full px-2.5 py-1 ${confidenceBadgeClass(entry.confidenceBucket)}`}
                        >
                          confiança {entry.confidenceBucket}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap font-medium">
                      {entry.text}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground/80">
                      <span>
                        Sessão:{' '}
                        <span className="font-mono text-muted-foreground">
                          {entry.sessionId.slice(0, 8)}
                        </span>
                      </span>
                      {entry.pasted && (
                        <span>
                          Injeção:{' '}
                          <span className="font-mono text-muted-foreground">
                            {entry.injectTotalMs}ms
                          </span>
                        </span>
                      )}
                      {entry.retryCount > 0 && (
                        <span className="text-orange-500 font-medium">
                          Retentativas: {entry.retryCount}
                        </span>
                      )}
                      {entry.rewriteApplied ? (
                        <span>
                          Rewrite:{' '}
                          <span className="font-mono text-muted-foreground">
                            {entry.rewriteRisk ?? 'low'}
                          </span>
                        </span>
                      ) : null}
                      {entry.appKey ? (
                        <span>
                          App:{' '}
                          <span className="font-mono text-muted-foreground">{entry.appKey}</span>
                        </span>
                      ) : null}
                      {entry.injectionMethod ? (
                        <span>
                          Método:{' '}
                          <span className="font-mono text-muted-foreground">
                            {entry.injectionMethod}
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-2 opacity-70 transition-opacity group-hover:opacity-100 sm:flex-col sm:items-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg bg-muted/50 px-4 text-xs font-medium text-foreground hover:bg-muted"
                      onClick={() => onCopyHistoryEntry(entry)}
                    >
                      Copiar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg text-xs font-medium text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                      disabled={historyBusy}
                      onClick={() => onRemoveHistoryEntry(entry.id)}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
});

export default HistoryTab;
