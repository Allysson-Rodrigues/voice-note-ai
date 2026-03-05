import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { HistoryEntry } from '@/electron';
import { History } from 'lucide-react';
import { memo } from 'react';
import { formatHistoryDate } from './utils';

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
    <Card className="border-border bg-card shadow-sm overflow-hidden h-full flex flex-col">
      <CardHeader className="border-b border-border/40 bg-muted/20 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-medium text-foreground">
              Histórico de Transcrições
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-1">
              Seus últimos ditados salvos localmente no dispositivo.
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
              Limpar Tudo
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1">
        <div className="max-h-[500px] overflow-y-auto w-full custom-scrollbar p-6 space-y-4">
          {historyEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <div className="text-base text-muted-foreground font-medium">Nenhum registro encontrado</div>
              <div className="text-sm text-muted-foreground/80 mt-1">Suas transcrições aparecerão aqui.</div>
            </div>
          ) : (
            historyEntries.map((entry) => (
              <div
                key={entry.id}
                className="group relative rounded-2xl border border-border/40 bg-muted/20 p-5 hover:bg-muted/60 hover:border-border transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                      <span className="text-foreground/80 bg-muted-foreground/10 px-2 py-1 rounded-md">
                        {formatHistoryDate(entry.createdAt)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <div
                          className={`h-1.5 w-1.5 rounded-full ${entry.pasted ? 'bg-emerald-500/70' : 'bg-blue-500/70'}`}
                        />
                        {entry.pasted ? 'Auto-Paste' : 'Clip-Only'}
                      </span>
                      <span>{Math.max(1, Math.round(entry.sessionDurationMs / 1000))}s captura</span>
                    </div>
                    <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap font-medium">
                      {entry.text}
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground/80">
                      <span>
                        Sessão:{' '}
                        <span className="font-mono text-muted-foreground">{entry.sessionId.slice(0, 8)}</span>
                      </span>
                      {entry.pasted && (
                        <span>
                          Injeção:{' '}
                          <span className="font-mono text-muted-foreground">{entry.injectTotalMs}ms</span>
                        </span>
                      )}
                      {entry.retryCount > 0 && (
                        <span className="text-orange-500 font-medium">
                          Retries: {entry.retryCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-2 opacity-50 transition-opacity group-hover:opacity-100 sm:flex-col sm:items-end">
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
                      Excluir
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
