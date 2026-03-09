import dotenv from "dotenv";
import { app, safeStorage } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { DEFAULT_CANONICAL_TERMS, type AppSettings } from "./settings-store.js";

export const APP_ID = "com.antigravity.vox-type";
export const APP_NAME = "Vox Type";
export const HOLD_HOOK_RECOVERY_RETRY_MS = 10000;

export function loadRuntimeEnv() {
  if (app.isPackaged) return;
  const candidates = [
    path.join(app.getAppPath(), ".env.local"),
    path.join(app.getAppPath(), ".env"),
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    dotenv.config({ path: candidate });
  }
}

export function getRuntimeConfig() {
  return {
    devServerUrl: process.env.VITE_DEV_SERVER_URL,
    isDev: Boolean(process.env.VITE_DEV_SERVER_URL),
    holdToTalkEnabled: (process.env.VOICE_HOLD_TO_TALK ?? "1") !== "0",
    hudEnabled: (process.env.VOICE_HUD ?? "1") !== "0",
    hudDebug: (process.env.VOICE_HUD_DEBUG ?? "0") !== "0",
  };
}

function parseBooleanEnv(value: string | undefined) {
  if (value == null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function resolveDefaultHistoryStorageMode() {
  const explicit = process.env.VOICE_HISTORY_STORAGE_MODE?.trim().toLowerCase();
  if (explicit === "encrypted") return "encrypted" as const;
  if (explicit === "plain") return "plain" as const;
  return safeStorage.isEncryptionAvailable()
    ? ("encrypted" as const)
    : ("plain" as const);
}

export function createDefaultSettings(): AppSettings {
  return {
    hotkeyPrimary: process.env.VOICE_HOTKEY ?? "CommandOrControl+Super",
    hotkeyFallback:
      process.env.VOICE_HOTKEY_FALLBACK ?? "CommandOrControl+Super+Space",
    autoPasteEnabled: parseBooleanEnv(process.env.VOICE_AUTO_PASTE) ?? true,
    toneMode:
      (process.env.VOICE_TONE ?? "casual") === "formal"
        ? "formal"
        : (process.env.VOICE_TONE ?? "casual") === "very-casual"
          ? "very-casual"
          : "casual",
    languageMode:
      (process.env.AZURE_SPEECH_LANGUAGE ?? "pt-BR") === "en-US"
        ? "en-US"
        : "pt-BR",
    sttProvider: "azure",
    extraPhrases: [],
    canonicalTerms: [...DEFAULT_CANONICAL_TERMS],
    stopGraceMs: Number(process.env.VOICE_STOP_GRACE_MS ?? "200") || 200,
    formatCommandsEnabled: true,
    maxSessionSeconds:
      Number(process.env.VOICE_MAX_SESSION_SECONDS ?? "90") || 90,
    historyEnabled: parseBooleanEnv(process.env.VOICE_HISTORY_ENABLED) ?? true,
    historyRetentionDays:
      Number(process.env.VOICE_HISTORY_RETENTION_DAYS ?? "30") || 30,
    injectionProfiles: {},
    privacyMode: parseBooleanEnv(process.env.VOICE_PRIVACY_MODE) ?? false,
    historyStorageMode: resolveDefaultHistoryStorageMode(),
    postprocessProfile:
      (process.env.VOICE_POSTPROCESS_PROFILE ?? "balanced") === "safe"
        ? "safe"
        : (process.env.VOICE_POSTPROCESS_PROFILE ?? "balanced") === "aggressive"
          ? "aggressive"
          : "balanced",
    dualLanguageStrategy:
      (process.env.VOICE_DUAL_LANGUAGE_STRATEGY ??
        "fallback-on-low-confidence") === "parallel"
        ? "parallel"
        : "fallback-on-low-confidence",
    rewriteEnabled: parseBooleanEnv(process.env.VOICE_REWRITE_ENABLED) ?? true,
    rewriteMode:
      (process.env.VOICE_REWRITE_MODE ?? "safe") === "off"
        ? "off"
        : (process.env.VOICE_REWRITE_MODE ?? "safe") === "aggressive"
          ? "aggressive"
          : "safe",
    intentDetectionEnabled:
      parseBooleanEnv(process.env.VOICE_INTENT_DETECTION_ENABLED) ?? true,
    protectedTerms: [],
    lowConfidencePolicy:
      (process.env.VOICE_LOW_CONFIDENCE_POLICY ?? "paste") === "paste"
        ? "paste"
        : (process.env.VOICE_LOW_CONFIDENCE_POLICY ?? "paste") === "copy-only"
          ? "copy-only"
          : "paste",
    adaptiveLearningEnabled:
      parseBooleanEnv(process.env.VOICE_ADAPTIVE_LEARNING_ENABLED) ?? true,
    appProfiles: {},
  };
}
