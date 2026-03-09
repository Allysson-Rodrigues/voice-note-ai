import type { AzureCredentialStatus } from "@/electron";
import type { UiHealthItem } from "./types";

export const sectionClass =
  "card-warm grid gap-4 rounded-[24px] p-5 sm:grid-cols-2";
export const sectionHeaderClass =
  "text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground";
export const fieldLabelClass =
  "text-[11px] font-bold uppercase tracking-widest text-muted-foreground";
export const selectClass =
  "h-11 w-full cursor-pointer appearance-none rounded-xl border border-border/50 bg-background px-4 text-sm text-foreground transition-all hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring";
export const inputClass =
  "h-11 w-full rounded-xl border border-border/50 bg-background px-4 text-sm text-foreground transition-all hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring";
export const textareaClass =
  "min-h-[132px] w-full rounded-2xl border border-border/50 bg-background px-4 py-3 text-sm text-foreground transition-all hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring";
export const surfaceClass =
  "rounded-2xl border border-border/40 bg-background/80 px-5 py-4 transition-colors hover:bg-background";

export function findHealthItem(items: UiHealthItem[], id: UiHealthItem["id"]) {
  return items.find((item) => item.id === id);
}

export function getAzureCredentialLabels(status: AzureCredentialStatus) {
  return {
    source:
      status.source === "secure-store"
        ? "Armazenamento seguro"
        : status.source === "environment"
          ? "Variáveis de ambiente"
          : "Não configurado",
    security:
      status.storageMode === "plain"
        ? "Credenciais legadas em texto simples detectadas."
        : status.canPersistSecurely
          ? "safeStorage disponível para persistência local segura."
          : "safeStorage indisponível. Use variáveis de ambiente para evitar texto simples.",
  };
}
