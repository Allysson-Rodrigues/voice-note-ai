import { lookup as lookupDns, resolve as resolveDns } from 'node:dns/promises';
import type { PerfSummary } from '../perf-store.js';

export const AZURE_CONFIG_MISSING_MESSAGE =
  'Azure STT nao configurado: defina AZURE_SPEECH_KEY e AZURE_SPEECH_REGION em .env.local.';

export type HealthStatus = 'ok' | 'warn' | 'error';

export type HealthCheckItem = {
  id: 'stt' | 'network' | 'hook' | 'history' | 'phrases' | 'injection' | 'security';
  status: HealthStatus;
  message: string;
};

export type HealthCheckReport = {
  generatedAt: string;
  items: HealthCheckItem[];
};

export function getAzureConfigError() {
  const key = (process.env.AZURE_SPEECH_KEY ?? '').trim();
  const region = (process.env.AZURE_SPEECH_REGION ?? '').trim();
  if (!key || !region) return AZURE_CONFIG_MISSING_MESSAGE;
  return null;
}

function getSttConfigError() {
  return getAzureConfigError();
}

async function checkNetworkHealth(): Promise<HealthCheckItem> {
  const providerError = getSttConfigError();
  if (providerError) {
    return {
      id: 'network',
      status: 'warn',
      message: 'Sem configuracao valida. Teste de rede para STT foi ignorado.',
    };
  }

  const host = `${(process.env.AZURE_SPEECH_REGION ?? '').trim().toLowerCase()}.stt.speech.microsoft.com`;

  try {
    const lookupResult = await lookupDns(host, { all: true });
    if (!lookupResult.length) throw new Error('DNS lookup returned no addresses');
    return {
      id: 'network',
      status: 'ok',
      message: `Rede OK (${host}).`,
    };
  } catch (lookupError) {
    try {
      await resolveDns(host, 'A');
      return {
        id: 'network',
        status: 'ok',
        message: `Rede OK (${host}).`,
      };
    } catch {
      try {
        await resolveDns(host, 'AAAA');
        return {
          id: 'network',
          status: 'ok',
          message: `Rede OK (${host}).`,
        };
      } catch {
        const code =
          typeof lookupError === 'object' &&
          lookupError &&
          'code' in lookupError &&
          typeof (lookupError as { code?: unknown }).code === 'string'
            ? (lookupError as { code: string }).code
            : null;
        return {
          id: 'network',
          status: 'error',
          message: `Falha ao resolver ${host}${code ? ` (${code})` : ''}. Verifique conexao, DNS ou firewall.`,
        };
      }
    }
  }
}

function checkHookHealth(args: {
  holdToTalkEnabled: boolean;
  holdHookActive: boolean;
}): HealthCheckItem {
  if (process.platform !== 'win32') {
    return {
      id: 'hook',
      status: 'warn',
      message:
        'Hook global de hold-to-talk e prioritario no Windows. Modo atual usa toggle/fallback.',
    };
  }

  if (!args.holdToTalkEnabled) {
    return {
      id: 'hook',
      status: 'warn',
      message: 'VOICE_HOLD_TO_TALK esta desativado.',
    };
  }

  if (!args.holdHookActive) {
    return {
      id: 'hook',
      status: 'error',
      message: 'Hook global indisponivel. Execute a recuperacao automatica.',
    };
  }

  return {
    id: 'hook',
    status: 'ok',
    message: 'Hook global ativo.',
  };
}

export async function getHealthCheckReport(args: {
  holdToTalkEnabled: boolean;
  holdHookActive: boolean;
  perfSummary?: PerfSummary;
  recentInjection?: {
    appKey: string | null;
    method: string | null;
    pasted: boolean;
    skippedReason?: string;
    updatedAt: string;
  } | null;
  historyEnabled: boolean;
  privacyMode: boolean;
  historyStorageMode: 'plain' | 'encrypted';
  isEncryptionAvailable: boolean;
  phraseBoostCount: number;
  runtimeSecurity: {
    cspEnabled: boolean;
    permissionsPolicy: 'default-deny';
    trustedOrigins: string[];
  };
}): Promise<HealthCheckReport> {
  const sttError = getSttConfigError();
  const sttItem: HealthCheckItem = sttError
    ? { id: 'stt', status: 'error', message: sttError }
    : { id: 'stt', status: 'ok', message: 'Azure STT configurado.' };

  const hookItem = checkHookHealth({
    holdToTalkEnabled: args.holdToTalkEnabled,
    holdHookActive: args.holdHookActive,
  });
  const networkItem = await checkNetworkHealth();
  const historyItem: HealthCheckItem = {
    id: 'history',
    status: args.privacyMode || args.historyStorageMode === 'plain' ? 'warn' : 'ok',
    message: args.privacyMode
      ? 'Modo privado ativo; historico local nao sera salvo.'
      : args.historyEnabled
        ? `Historico ativo (${args.historyStorageMode}).`
        : 'Historico desativado.',
  };
  const phraseItem: HealthCheckItem = {
    id: 'phrases',
    status: args.phraseBoostCount > 0 ? 'ok' : 'warn',
    message:
      args.phraseBoostCount > 0
        ? `${args.phraseBoostCount} phrase boosts ativos.`
        : 'Nenhum phrase boost ativo.',
  };
  const injectionItem: HealthCheckItem = args.recentInjection
    ? {
        id: 'injection',
        status: args.recentInjection.pasted ? 'ok' : 'warn',
        message: args.recentInjection.pasted
          ? `Ultimo paste OK via ${args.recentInjection.method ?? 'desconhecido'}.`
          : `Ultimo paste falhou (${args.recentInjection.skippedReason ?? 'sem motivo'}).`,
      }
    : {
        id: 'injection',
        status: 'warn',
        message: 'Sem dados recentes de injection.',
      };
  if (args.perfSummary && args.perfSummary.sampleCount > 0) {
    injectionItem.message += ` ${args.perfSummary.sampleCount} amostras de performance registradas.`;
  }

  const securityStatus: HealthStatus =
    !args.runtimeSecurity.cspEnabled || args.runtimeSecurity.permissionsPolicy !== 'default-deny'
      ? 'error'
      : args.historyStorageMode === 'plain' || !args.isEncryptionAvailable
        ? 'warn'
        : 'ok';
  const securityMessages = [
    args.runtimeSecurity.cspEnabled ? 'CSP runtime ativa.' : 'CSP runtime desativada.',
    args.runtimeSecurity.permissionsPolicy === 'default-deny'
      ? 'Permissoes em default deny.'
      : 'Permissoes fora do modo estrito.',
    args.historyStorageMode === 'encrypted'
      ? 'Historico criptografado.'
      : 'Historico em plain text.',
    args.isEncryptionAvailable
      ? 'safeStorage disponivel.'
      : 'safeStorage indisponivel neste ambiente.',
  ];
  const securityItem: HealthCheckItem = {
    id: 'security',
    status: securityStatus,
    message: securityMessages.join(' '),
  };

  return {
    generatedAt: new Date().toISOString(),
    items: [sttItem, networkItem, hookItem, historyItem, phraseItem, injectionItem, securityItem],
  };
}
