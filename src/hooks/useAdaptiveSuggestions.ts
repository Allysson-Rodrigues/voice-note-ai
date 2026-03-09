import { useCallback, useEffect, useState } from 'react';
import type { ActiveTab } from '@/components/index/types';
import type { AdaptiveSuggestion } from '@/electron';
import type { AppToast } from './app-toast';

type UseAdaptiveSuggestionsOptions = {
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

export function useAdaptiveSuggestions({
  activeTab,
  hasDesktopApi,
  toast,
}: UseAdaptiveSuggestionsOptions) {
  const [suggestions, setSuggestions] = useState<AdaptiveSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!hasDesktopApi) return;
    setLoading(true);
    try {
      const next = await window.voiceNoteAI.listAdaptiveSuggestions();
      setSuggestions(next);
    } catch (error) {
      toast({
        title: 'Falha ao carregar sugestões',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [hasDesktopApi, toast]);

  useEffect(() => {
    if (activeTab !== 'settings' || !hasDesktopApi) return;
    void refresh();
  }, [activeTab, hasDesktopApi, refresh]);

  const applySuggestion = useCallback(
    async (suggestion: AdaptiveSuggestion) => {
      if (!hasDesktopApi) return;
      try {
        setBusyId(suggestion.id);
        const result = await window.voiceNoteAI.applyAdaptiveSuggestion(suggestion.id);
        ensureOkResult(result, 'A sugestão adaptativa não foi aplicada.');
        setSuggestions((current) => current.filter((entry) => entry.id !== suggestion.id));
        toast({
          title: 'Sugestão aplicada',
          description: suggestion.reason,
        });
      } catch (error) {
        toast({
          title: 'Falha ao aplicar sugestão',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      } finally {
        setBusyId(null);
      }
    },
    [hasDesktopApi, toast],
  );

  const dismissSuggestion = useCallback(
    async (suggestion: AdaptiveSuggestion) => {
      if (!hasDesktopApi) return;
      try {
        setBusyId(suggestion.id);
        const result = await window.voiceNoteAI.dismissAdaptiveSuggestion(suggestion.id);
        ensureOkResult(result, 'A sugestão adaptativa não foi dispensada.');
        setSuggestions((current) => current.filter((entry) => entry.id !== suggestion.id));
      } catch (error) {
        toast({
          title: 'Falha ao dispensar sugestão',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      } finally {
        setBusyId(null);
      }
    },
    [hasDesktopApi, toast],
  );

  return {
    applySuggestion,
    busyId,
    dismissSuggestion,
    loading,
    refresh,
    suggestions,
  };
}
