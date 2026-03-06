import { lookup as lookupDns, resolve as resolveDns } from 'node:dns/promises';
import type { PerfSummary } from '../perf-store.js';

type AzureConfigErrorOptions = {
  isPackaged?: boolean;
};

export function getAzureConfigMissingMessage(options: AzureConfigErrorOptions = {}) {
  if (options.isPackaged) {
    return 'Azure STT não configurado: defina AZURE_SPEECH_KEY e AZURE_SPEECH_REGION nas variáveis de ambiente do sistema e reabra o aplicativo.';
  }

  return 'Azure STT não configurado: defina AZURE_SPEECH_KEY e AZURE_SPEECH_REGION no arquivo .env.local.';
}

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

export function getAzureConfigError(options: AzureConfigErrorOptions = {}) {
  const key = (process.env.AZURE_SPEECH_KEY ?? '').trim();
  const region = (process.env.AZURE_SPEECH_REGION ?? '').trim();
  if (!key || !region) return getAzureConfigMissingMessage(options);
  return null;
}

function getSttConfigError(options: AzureConfigErrorOptions = {}) {
  return getAzureConfigError(options);
}

async function checkNetworkHealth(options: AzureConfigErrorOptions = {}): Promise<HealthCheckItem> {
  const providerError = getSttConfigError(options);
  if (providerError) {
    return {
      id: 'network',
      status: 'warn',
      message: 'Configuração do Azure ausente. O teste de rede do STT foi ignorado.',
    };
  }

  const host = `${(process.env.AZURE_SPEECH_REGION ?? '').trim().toLowerCase()}.stt.speech.microsoft.com`;

  try {
    const lookupResult = await lookupDns(host, { all: true });
    if (!lookupResult.length) throw new Error('DNS lookup returned no addresses');
    return {
      id: 'network',
      status: 'ok',
      message: `Conectividade com o Azure validada (${host}).`,
    };
  } catch (lookupError) {
    try {
      await resolveDns(host, 'A');
      return {
        id: 'network',
        status: 'ok',
        message: `Conectividade com o Azure validada (${host}).`,
      };
    } catch {
      try {
        await resolveDns(host, 'AAAA');
        return {
          id: 'network',
          status: 'ok',
          message: `Conectividade com o Azure validada (${host}).`,
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
          message: `Não foi possível resolver ${host}${code ? ` (${code})` : ''}. Verifique internet, DNS ou firewall.`,
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
      message: 'O atalho global prioritário existe no Windows. Neste ambiente o app usa modo alternativo.',
    };
  }

  if (!args.holdToTalkEnabled) {
    return {
      id: 'hook',
      status: 'warn',
      message: 'O modo segurar para falar está desativado pela configuração atual.',
    };
  }

  if (!args.holdHookActive) {
    return {
      id: 'hook',
      status: 'error',
      message: 'O atalho global não carregou. Use a recuperação automática para restaurar o PTT.',
    };
  }

  return {
    id: 'hook',
    status: 'ok',
    message: 'Atalho global ativo e pronto para captura.',
  };
}

export async function getHealthCheckReport(args: {
  isPackagedApp?: boolean;
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
  const sttError = getSttConfigError({ isPackaged: args.isPackagedApp });
  const sttItem: HealthCheckItem = sttError
    ? { id: 'stt', status: 'error', message: sttError }
    : { id: 'stt', status: 'ok', message: 'Azure Speech-to-Text configurado corretamente.' };

  const hookItem = checkHookHealth({
    holdToTalkEnabled: args.holdToTalkEnabled,
    holdHookActive: args.holdHookActive,
  });
  const networkItem = await checkNetworkHealth({ isPackaged: args.isPackagedApp });
  const historyItem: HealthCheckItem = {
    id: 'history',
    status: args.privacyMode || args.historyStorageMode === 'plain' ? 'warn' : 'ok',
    message: args.privacyMode
      ? 'Modo privado ativo. O aplicativo não vai salvar transcrições no histórico local.'
      : args.historyEnabled
        ? args.historyStorageMode === 'encrypted'
          ? 'Histórico local ativo com proteção criptografada.'
          : 'Histórico local ativo sem criptografia. Considere ativar proteção criptografada.'
        : 'Histórico local desativado.',
  };
  const phraseItem: HealthCheckItem = {
    id: 'phrases',
    status: args.phraseBoostCount > 0 ? 'ok' : 'warn',
    message:
      args.phraseBoostCount > 0
        ? `${args.phraseBoostCount} termos de reforço ativos para melhorar o reconhecimento.`
        : 'Nenhum termo de reforço configurado para reconhecimento.',
  };
  const injectionItem: HealthCheckItem = args.recentInjection
    ? {
        id: 'injection',
        status: args.recentInjection.pasted ? 'ok' : 'warn',
        message: args.recentInjection.pasted
          ? `Última inserção de texto concluída com sucesso via ${args.recentInjection.method ?? 'método desconhecido'}.`
          : `A última inserção automática falhou (${args.recentInjection.skippedReason ?? 'motivo não informado'}).`,
      }
    : {
        id: 'injection',
        status: 'warn',
        message: 'Ainda não há dados recentes sobre inserção automática de texto.',
      };
  if (args.perfSummary && args.perfSummary.sampleCount > 0) {
    injectionItem.message += ` ${args.perfSummary.sampleCount} amostras de desempenho registradas.`;
  }

  const securityStatus: HealthStatus =
    !args.runtimeSecurity.cspEnabled || args.runtimeSecurity.permissionsPolicy !== 'default-deny'
      ? 'error'
      : args.historyStorageMode === 'plain' || !args.isEncryptionAvailable
        ? 'warn'
        : 'ok';
  const securityMessages = [
    args.runtimeSecurity.cspEnabled ? 'CSP em tempo de execução ativa.' : 'CSP em tempo de execução desativada.',
    args.runtimeSecurity.permissionsPolicy === 'default-deny'
      ? 'Permissões no modo default deny.'
      : 'Permissões fora do modo estrito.',
    args.historyStorageMode === 'encrypted'
      ? 'Histórico protegido com criptografia.'
      : 'Histórico armazenado em texto simples.',
    args.isEncryptionAvailable
      ? 'safeStorage disponível.'
      : 'safeStorage indisponível neste ambiente.',
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
