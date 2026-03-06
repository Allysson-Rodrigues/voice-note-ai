import { useCallback, useEffect, useState } from 'react';
import type { ActiveTab } from '@/components/index/types';
import type { HistoryEntry } from '@/electron';
import type { AppToast } from './app-toast';

type UseHistoryOptions = {
  activeTab: ActiveTab;
  hasDesktopApi: boolean;
  toast: AppToast;
};

function ensureOkResult(
  result: { ok?: boolean } | null | undefined,
  fallbackMessage: string,
): asserts result is { ok: true } {
  if (result?.ok !== true) {
    throw new Error(fallbackMessage);
  }
}

export function useHistory({ activeTab, hasDesktopApi, toast }: UseHistoryOptions) {
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);

  const loadHistory = useCallback(
    async (query: string) => {
      if (!hasDesktopApi) return;

      setHistoryLoading(true);
      try {
        const entries = await window.voiceNoteAI.listHistory({ query, limit: 120 });
        setHistoryEntries(entries);
      } catch (error) {
        toast({
          title: 'Falha ao carregar histórico',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      } finally {
        setHistoryLoading(false);
      }
    },
    [hasDesktopApi, toast],
  );

  useEffect(() => {
    if (!hasDesktopApi || activeTab !== 'history') return;
    const timer = window.setTimeout(() => {
      void loadHistory(historyQuery);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [activeTab, hasDesktopApi, historyQuery, loadHistory]);

  const refreshHistory = useCallback(async () => {
    await loadHistory(historyQuery);
  }, [historyQuery, loadHistory]);

  const copyHistoryEntry = useCallback(
    async (entry: HistoryEntry) => {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(entry.text);
        }
        toast({
          title: 'Texto copiado',
          description: 'A transcrição foi copiada para a área de transferência.',
        });
      } catch (error) {
        toast({
          title: 'Falha ao copiar texto',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  const removeHistoryEntry = useCallback(
    async (id: string) => {
      if (!hasDesktopApi || historyBusy) return;
      try {
        setHistoryBusy(true);
        const result = await window.voiceNoteAI.removeHistoryEntry(id);
        ensureOkResult(result, 'O item do historico nao foi removido.');
        setHistoryEntries((current) => current.filter((entry) => entry.id !== id));
      } catch (error) {
        toast({
          title: 'Falha ao remover item',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      } finally {
        setHistoryBusy(false);
      }
    },
    [hasDesktopApi, historyBusy, toast],
  );

  const clearHistory = useCallback(async () => {
    if (!hasDesktopApi || historyBusy) return;
    try {
      setHistoryBusy(true);
      const result = await window.voiceNoteAI.clearHistory();
      ensureOkResult(result, 'O historico nao foi limpo.');
      setHistoryEntries([]);
      toast({
        title: 'Histórico limpo',
        description: `${result.removed} item(ns) removido(s).`,
      });
    } catch (error) {
      toast({
        title: 'Falha ao limpar histórico',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setHistoryBusy(false);
    }
  }, [hasDesktopApi, historyBusy, toast]);

  return {
    clearHistory,
    copyHistoryEntry,
    historyBusy,
    historyEntries,
    historyLoading,
    historyQuery,
    loadHistory,
    refreshHistory,
    removeHistoryEntry,
    setHistoryQuery,
  };
}
