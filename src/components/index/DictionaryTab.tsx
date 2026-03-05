import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { CanonicalTerm, DictionaryTerm } from '@/electron';
import { memo } from 'react';

type DictionaryTabProps = {
  canonicalTerms: CanonicalTerm[];
  dictionary: DictionaryTerm[];
  dictionaryAvailable: boolean;
  dictionaryBusy: boolean;
  hasDesktopApi: boolean;
  newCanonicalFrom: string;
  newCanonicalTo: string;
  newHintPt: string;
  newTerm: string;
  onAddCanonicalTerm: () => void;
  onAddDictionaryTerm: () => void;
  onDictionaryReload: () => void;
  onRemoveCanonicalTerm: (index: number) => void;
  onRemoveDictionaryTerm: (id: string) => void;
  onSetNewCanonicalFrom: (value: string) => void;
  onSetNewCanonicalTo: (value: string) => void;
  onSetNewHintPt: (value: string) => void;
  onSetNewTerm: (value: string) => void;
  onToggleCanonicalTerm: (index: number, enabled: boolean) => void;
  onToggleTermEnabled: (item: DictionaryTerm, enabled: boolean) => void;
};

const DictionaryTab = memo(function DictionaryTab({
  canonicalTerms,
  dictionary,
  dictionaryAvailable,
  dictionaryBusy,
  hasDesktopApi,
  newCanonicalFrom,
  newCanonicalTo,
  newHintPt,
  newTerm,
  onAddCanonicalTerm,
  onAddDictionaryTerm,
  onDictionaryReload,
  onRemoveCanonicalTerm,
  onRemoveDictionaryTerm,
  onSetNewCanonicalFrom,
  onSetNewCanonicalTo,
  onSetNewHintPt,
  onSetNewTerm,
  onToggleCanonicalTerm,
  onToggleTermEnabled,
}: DictionaryTabProps) {
  return (
    <div className="space-y-6">
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-5">
          <CardTitle className="text-lg font-medium text-foreground">Dicionário Primário</CardTitle>
          <CardDescription>
            Refine a engine de STT para reconhecer termos complexos ou jargões.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {!dictionaryAvailable && (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              Indisponível. Reinicie o App Desktop.
            </div>
          )}

          <div className="rounded-2xl border border-border/40 bg-muted/20 p-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              Adicionar Novo Termo
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                placeholder="Termo em inglês (ex: Tailwind)"
                value={newTerm}
                onChange={(e) => onSetNewTerm(e.target.value)}
                disabled={!hasDesktopApi || dictionaryBusy || !dictionaryAvailable}
                className="h-11 rounded-xl border-border/50 bg-background px-4 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Input
                placeholder="Hint de pronúncia PT (opcional)"
                value={newHintPt}
                onChange={(e) => onSetNewHintPt(e.target.value)}
                disabled={!hasDesktopApi || dictionaryBusy || !dictionaryAvailable}
                className="h-11 rounded-xl border-border/50 bg-background px-4 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <Button
                className="h-10 rounded-xl px-6"
                onClick={onAddDictionaryTerm}
                disabled={!hasDesktopApi || dictionaryBusy || !dictionaryAvailable}
              >
                Salvar Regra
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-xl bg-transparent"
                onClick={onDictionaryReload}
                disabled={!hasDesktopApi || dictionaryBusy || !dictionaryAvailable}
              >
                Recarregar
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
              Termos Cadastrados
            </div>
            <div className="max-h-[350px] space-y-3 overflow-y-auto pr-2 custom-scrollbar">
              {dictionary.length === 0 ? (
                <div className="rounded-2xl border border-border/30 bg-muted/10 p-8 text-sm text-muted-foreground/60 text-center italic">
                  Nenhum termo cadastrado no dicionário primário.
                </div>
              ) : (
                dictionary.map((item) => (
                  <div
                    key={item.id}
                    className={`group flex flex-wrap items-center justify-between gap-4 rounded-2xl border ${item.enabled ? 'border-border/50 bg-card' : 'border-border/20 bg-muted/10 opacity-60'} p-4 hover:bg-muted/30 transition-all`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-medium text-foreground">{item.term}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                        <span className="inline-block px-2 py-0.5 rounded bg-muted/50 border border-border/50">
                          {item.hintPt ? `Dica PT: ${item.hintPt}` : 'Sem dica de pronúncia'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-5">
                      <Switch
                        checked={item.enabled}
                        disabled={dictionaryBusy || !hasDesktopApi || !dictionaryAvailable}
                        onCheckedChange={(enabled) => onToggleTermEnabled(item, enabled)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                        disabled={dictionaryBusy || !hasDesktopApi || !dictionaryAvailable}
                        onClick={() => onRemoveDictionaryTerm(item.id)}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-5">
          <CardTitle className="text-lg font-medium text-foreground">
            Correções Pós-Processamento
          </CardTitle>
          <CardDescription>
            Normalização textual exata (RegEx e Case Matching).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="rounded-2xl border border-border/40 bg-muted/20 p-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              Nova Correção Textual
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
              <Input
                placeholder="Origem (ex: react native|reactnative)"
                value={newCanonicalFrom}
                onChange={(e) => onSetNewCanonicalFrom(e.target.value)}
                disabled={!hasDesktopApi || dictionaryBusy}
                className="h-11 rounded-xl border-border/50 bg-background px-4 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring font-mono text-sm"
              />
              <Input
                placeholder="Destino (ex: React Native)"
                value={newCanonicalTo}
                onChange={(e) => onSetNewCanonicalTo(e.target.value)}
                disabled={!hasDesktopApi || dictionaryBusy}
                className="h-11 rounded-xl border-border/50 bg-background px-4 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring font-mono text-sm"
              />
              <Button
                className="h-11 rounded-xl px-6"
                onClick={onAddCanonicalTerm}
                disabled={!hasDesktopApi || dictionaryBusy}
              >
                Adicionar
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="max-h-[300px] space-y-3 overflow-y-auto pr-2 custom-scrollbar">
              {canonicalTerms.length === 0 ? (
                <div className="rounded-2xl border border-border/30 bg-muted/10 p-8 text-sm text-muted-foreground/60 text-center italic">
                  Nenhuma correção pós-processo.
                </div>
              ) : (
                canonicalTerms.map((item, index) => (
                  <div
                    key={`${item.from}-${index}`}
                    className={`group flex flex-wrap items-center justify-between gap-4 rounded-2xl border ${item.enabled ? 'border-border/50 bg-card' : 'border-border/20 bg-muted/10 opacity-60'} p-4 hover:bg-muted/30 transition-all`}
                  >
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center gap-3 text-sm font-medium font-mono">
                        <span className="truncate text-foreground/80 bg-muted/50 px-3 py-1.5 rounded-lg border border-border/50 w-1/3 text-center">
                          {item.from}
                        </span>
                        <span className="text-muted-foreground/60 flex-shrink-0">→</span>
                        <span className="truncate text-foreground bg-background px-3 py-1.5 rounded-lg border border-border/50 w-1/3 text-center">
                          {item.to}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-5">
                      <Switch
                        checked={item.enabled}
                        disabled={!hasDesktopApi || dictionaryBusy}
                        onCheckedChange={(enabled) => onToggleCanonicalTerm(index, enabled)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                        disabled={!hasDesktopApi || dictionaryBusy}
                        onClick={() => onRemoveCanonicalTerm(index)}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default DictionaryTab;
