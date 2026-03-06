import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveTab } from '@/components/index/types';
import type { CanonicalTerm, DictionaryTerm } from '@/electron';
import type { AppToast } from './app-toast';

type UseDictionaryOptions = {
  activeTab: ActiveTab;
  hasDesktopApi: boolean;
  toast: AppToast;
};

function normalizeCanonicalValue(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function ensureOkResult(
  result: { ok?: boolean } | null | undefined,
  fallbackMessage: string,
): asserts result is { ok: true } {
  if (result?.ok !== true) {
    throw new Error(fallbackMessage);
  }
}

export function useDictionary({ activeTab, hasDesktopApi, toast }: UseDictionaryOptions) {
  const [canonicalTerms, setCanonicalTerms] = useState<CanonicalTerm[]>([]);
  const [dictionary, setDictionary] = useState<DictionaryTerm[]>([]);
  const [dictionaryAvailable, setDictionaryAvailable] = useState(true);
  const [dictionaryBusy, setDictionaryBusy] = useState(false);
  const [newCanonicalFrom, setNewCanonicalFrom] = useState('');
  const [newCanonicalTo, setNewCanonicalTo] = useState('');
  const [newHintPt, setNewHintPt] = useState('');
  const [newTerm, setNewTerm] = useState('');
  const dictionaryLoadedRef = useRef(false);

  const loadDictionaryData = useCallback(async () => {
    if (!hasDesktopApi) return;

    setDictionaryBusy(true);
    try {
      const [settingsResult, dictionaryResult] = await Promise.allSettled([
        window.voiceNoteAI.getSettings(),
        window.voiceNoteAI.listDictionary(),
      ]);

      if (settingsResult.status === 'fulfilled') {
        setCanonicalTerms(settingsResult.value.canonicalTerms ?? []);
      }

      if (dictionaryResult.status === 'fulfilled') {
        setDictionary(dictionaryResult.value);
        setDictionaryAvailable(true);
        dictionaryLoadedRef.current = true;
        return;
      }

      const message =
        dictionaryResult.reason instanceof Error
          ? dictionaryResult.reason.message
          : String(dictionaryResult.reason);

      if (message.includes("No handler registered for 'dictionary:list'")) {
        setDictionaryAvailable(false);
        toast({
          title: 'Vocabulário indisponível',
          description: 'Reinicie o aplicativo desktop para habilitar este recurso.',
        });
        return;
      }

      throw dictionaryResult.reason;
    } catch (error) {
      toast({
        title: 'Falha ao carregar vocabulário',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setDictionaryBusy(false);
    }
  }, [hasDesktopApi, toast]);

  useEffect(() => {
    if (activeTab !== 'dictionary' || dictionaryLoadedRef.current) return;
    void loadDictionaryData();
  }, [activeTab, loadDictionaryData]);

  const persistCanonicalTerms = useCallback(
    async (nextTerms: CanonicalTerm[]) => {
      if (!hasDesktopApi) return;
      const result = await window.voiceNoteAI.updateSettings({ canonicalTerms: nextTerms });
      ensureOkResult(result, 'O aplicativo nao confirmou a atualizacao das correcoes.');
      setCanonicalTerms(nextTerms);
    },
    [hasDesktopApi],
  );

  const addCanonicalTerm = useCallback(async () => {
    if (!hasDesktopApi || dictionaryBusy) return;

    const from = normalizeCanonicalValue(newCanonicalFrom);
    const to = normalizeCanonicalValue(newCanonicalTo);
    if (!from || !to) {
      toast({
        title: 'Campos incompletos',
        description: 'Informe a origem e o destino da correção.',
        variant: 'destructive',
      });
      return;
    }

    const exists = canonicalTerms.some(
      (item) =>
        `${item.from.toLowerCase()}=>${item.to.toLowerCase()}` ===
        `${from.toLowerCase()}=>${to.toLowerCase()}`,
    );
    if (exists) {
      toast({
        title: 'Correção já cadastrada',
        description: 'Essa regra já existe na lista de correções.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setDictionaryBusy(true);
      await persistCanonicalTerms([...canonicalTerms, { from, to, enabled: true }]);
      setNewCanonicalFrom('');
      setNewCanonicalTo('');
      toast({
        title: 'Correção adicionada',
        description: `${from} → ${to}`,
      });
    } catch (error) {
      toast({
        title: 'Falha ao salvar correção',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setDictionaryBusy(false);
    }
  }, [
    canonicalTerms,
    dictionaryBusy,
    hasDesktopApi,
    newCanonicalFrom,
    newCanonicalTo,
    persistCanonicalTerms,
    toast,
  ]);

  const toggleCanonicalTerm = useCallback(
    async (index: number, enabled: boolean) => {
      if (!hasDesktopApi || dictionaryBusy) return;
      try {
        setDictionaryBusy(true);
        await persistCanonicalTerms(
          canonicalTerms.map((item, itemIndex) =>
            itemIndex === index ? { ...item, enabled } : item,
          ),
        );
      } catch (error) {
        toast({
          title: 'Falha ao atualizar correção',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      } finally {
        setDictionaryBusy(false);
      }
    },
    [canonicalTerms, dictionaryBusy, hasDesktopApi, persistCanonicalTerms, toast],
  );

  const removeCanonicalTerm = useCallback(
    async (index: number) => {
      if (!hasDesktopApi || dictionaryBusy) return;
      try {
        setDictionaryBusy(true);
        await persistCanonicalTerms(canonicalTerms.filter((_, itemIndex) => itemIndex !== index));
      } catch (error) {
        toast({
          title: 'Falha ao remover correção',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      } finally {
        setDictionaryBusy(false);
      }
    },
    [canonicalTerms, dictionaryBusy, hasDesktopApi, persistCanonicalTerms, toast],
  );

  const addDictionaryTerm = useCallback(async () => {
    if (!hasDesktopApi || dictionaryBusy || !dictionaryAvailable) return;

    const term = newTerm.trim();
    if (!term) {
      toast({
        title: 'Termo inválido',
        description: 'Informe um termo válido para reforço de reconhecimento.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setDictionaryBusy(true);
      const result = await window.voiceNoteAI.addDictionaryTerm({
        term,
        hintPt: newHintPt.trim() || undefined,
      });
      ensureOkResult(result, 'O aplicativo nao confirmou a inclusao do termo.');
      setNewTerm('');
      setNewHintPt('');
      await loadDictionaryData();
      toast({
        title: 'Termo adicionado',
        description: term,
      });
    } catch (error) {
      toast({
        title: 'Falha ao adicionar termo',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setDictionaryBusy(false);
    }
  }, [
    dictionaryAvailable,
    dictionaryBusy,
    hasDesktopApi,
    loadDictionaryData,
    newHintPt,
    newTerm,
    toast,
  ]);

  const toggleTermEnabled = useCallback(
    async (item: DictionaryTerm, enabled: boolean) => {
      if (!hasDesktopApi || dictionaryBusy || !dictionaryAvailable) return;
      try {
        setDictionaryBusy(true);
        const result = await window.voiceNoteAI.updateDictionaryTerm({ id: item.id, enabled });
        ensureOkResult(result, 'O aplicativo nao confirmou a atualizacao do termo.');
        setDictionary((current) =>
          current.map((entry) => (entry.id === result.term.id ? result.term : entry)),
        );
      } catch (error) {
        toast({
          title: 'Falha ao atualizar termo',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      } finally {
        setDictionaryBusy(false);
      }
    },
    [dictionaryAvailable, dictionaryBusy, hasDesktopApi, toast],
  );

  const removeDictionaryTerm = useCallback(
    async (id: string) => {
      if (!hasDesktopApi || dictionaryBusy || !dictionaryAvailable) return;
      try {
        setDictionaryBusy(true);
        const result = await window.voiceNoteAI.removeDictionaryTerm(id);
        ensureOkResult(result, 'O termo nao foi removido.');
        setDictionary((current) => current.filter((item) => item.id !== id));
      } catch (error) {
        toast({
          title: 'Falha ao remover termo',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      } finally {
        setDictionaryBusy(false);
      }
    },
    [dictionaryAvailable, dictionaryBusy, hasDesktopApi, toast],
  );

  return {
    addCanonicalTerm,
    addDictionaryTerm,
    canonicalTerms,
    dictionary,
    dictionaryAvailable,
    dictionaryBusy,
    loadDictionaryData,
    newCanonicalFrom,
    newCanonicalTo,
    newHintPt,
    newTerm,
    removeCanonicalTerm,
    removeDictionaryTerm,
    setNewCanonicalFrom,
    setNewCanonicalTo,
    setNewHintPt,
    setNewTerm,
    toggleCanonicalTerm,
    toggleTermEnabled,
  };
}
