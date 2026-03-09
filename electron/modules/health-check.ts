import { lookup as lookupDns } from 'node:dns/promises';
import type { PerfSummary } from '../perf-store.js';

type AzureConfigErrorOptions = {
  credentials?: {
    key?: string;
    region?: string;
  } | null;
};

export type AzureCredentialSource = 'secure-store' | 'environment' | 'missing';

export type AzureConnectionResult = {
  status: 'ok' | 'auth-error' | 'network-error' | 'config-error';
  message: string;
  host: string | null;
};

export type HealthStatus = 'ok' | 'warn' | 'error';

export type HealthCheckItem = {
  id: 'stt' | 'network' | 'hook' | 'history' | 'phrases' | 'injection' | 'security' | 'microphone';
  status: HealthStatus;
  message: string;
};

export type HealthCheckReport = {
  generatedAt: string;
  items: HealthCheckItem[];
};

function normalizeAzureRegion(value: string | undefined) {
  return (value ?? '').replace(/\s+/g, '').trim().toLowerCase();
}

function resolveAzureTokenHost(region: string) {
  return `${normalizeAzureRegion(region)}.api.cognitive.microsoft.com`;
}

function resolveAzureCredentials(
  input: AzureConfigErrorOptions['credentials'],
  env: NodeJS.ProcessEnv = process.env,
) {
  const key = (input?.key ?? env.AZURE_SPEECH_KEY ?? '').trim();
  const region = normalizeAzureRegion(input?.region ?? env.AZURE_SPEECH_REGION);
  return { key, region };
}

function describeAzureSource(source: AzureCredentialSource | undefined) {
  if (source === 'secure-store') return 'armazenamento seguro local';
  if (source === 'environment') return 'variáveis de ambiente';
  return 'configuração local';
}

export function getAzureConfigMissingMessage() {
  return 'Azure STT não configurado: informe chave e região nas configurações do app ou nas variáveis AZURE_SPEECH_KEY e AZURE_SPEECH_REGION.';
}

export function getAzureConfigError(options: AzureConfigErrorOptions = {}) {
  const { key, region } = resolveAzureCredentials(options.credentials);
  if (!key || !region) return getAzureConfigMissingMessage();
  return null;
}

export async function testAzureSpeechConnection(
  credentials: {
    key: string;
    region: string;
  },
  dependencies: {
    fetchImpl?: typeof fetch;
    lookupImpl?: typeof lookupDns;
    timeoutMs?: number;
  } = {},
): Promise<AzureConnectionResult> {
  const { key, region } = resolveAzureCredentials(credentials);
  const host = region ? resolveAzureTokenHost(region) : null;
  if (!key || !region || !host) {
    return {
      status: 'config-error',
      message: getAzureConfigMissingMessage(),
      host,
    };
  }

  const lookupImpl = dependencies.lookupImpl ?? lookupDns;
  try {
    const lookupResult = await lookupImpl(host, { all: true });
    if (!lookupResult.length) {
      return {
        status: 'network-error',
        message: `Não foi possível resolver ${host}. Verifique internet, DNS ou firewall.`,
        host,
      };
    }
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : null;
    return {
      status: 'network-error',
      message: `Não foi possível resolver ${host}${code ? ` (${code})` : ''}. Verifique internet, DNS ou firewall.`,
      host,
    };
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(1000, dependencies.timeoutMs ?? 5000);
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchImpl = dependencies.fetchImpl ?? fetch;
    const response = await fetchImpl(`https://${host}/sts/v1.0/issueToken`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: '',
      signal: controller.signal,
    });

    const body = await response.text().catch(() => '');
    if (response.ok && body.trim()) {
      return {
        status: 'ok',
        message: `Autenticação com Azure Speech validada em ${host}.`,
        host,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        status: 'auth-error',
        message: 'Azure Speech rejeitou a autenticação. Verifique chave e região configuradas.',
        host,
      };
    }

    if (response.status === 400 || response.status === 404) {
      return {
        status: 'config-error',
        message:
          'Azure Speech não reconheceu a região informada. Revise a configuração antes de continuar.',
        host,
      };
    }

    if (response.status >= 500) {
      return {
        status: 'network-error',
        message: `Azure Speech respondeu com indisponibilidade temporária (${response.status}). Tente novamente em instantes.`,
        host,
      };
    }

    return {
      status: 'config-error',
      message:
        `Azure Speech respondeu com status inesperado (${response.status}). ${body.trim() || 'Revise a configuração e tente novamente.'}`.trim(),
      host,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `A validação do Azure expirou após ${timeoutMs} ms.`
        : error instanceof Error
          ? error.message
          : String(error);
    return {
      status: 'network-error',
      message: `Falha de rede ao validar Azure Speech (${message}).`,
      host,
    };
  } finally {
    clearTimeout(timeoutHandle);
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
        'O atalho global prioritário existe no Windows. Neste ambiente o app usa modo alternativo.',
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
  azureCredentialSource?: AzureCredentialSource;
  azureCredentialStorageMode?: 'encrypted' | 'plain' | 'none';
  azureCredentials?: {
    key: string;
    region: string;
  } | null;
  includeExternalAzureCheck?: boolean;
  testAzureConnection?: (() => Promise<AzureConnectionResult>) | null;
  microphone?: {
    status: HealthStatus;
    message: string;
  };
}): Promise<HealthCheckReport> {
  const sttError = getAzureConfigError({ credentials: args.azureCredentials });
  const connectionResult =
    sttError || !args.includeExternalAzureCheck || !args.testAzureConnection
      ? null
      : await args.testAzureConnection();
  const sourceLabel = describeAzureSource(args.azureCredentialSource);

  const sttItem: HealthCheckItem = sttError
    ? { id: 'stt', status: 'error', message: sttError }
    : !args.includeExternalAzureCheck
      ? {
          id: 'stt',
          status: 'warn',
          message: `Azure Speech configurado via ${sourceLabel}. Use "Testar conexão" para validar autenticação e região.`,
        }
      : connectionResult?.status === 'ok'
        ? {
            id: 'stt',
            status: 'ok',
            message: `Azure Speech configurado corretamente via ${sourceLabel}.`,
          }
        : connectionResult?.status === 'network-error'
          ? {
              id: 'stt',
              status: 'warn',
              message: `As credenciais foram carregadas via ${sourceLabel}, mas a validação online não pôde ser concluída.`,
            }
          : {
              id: 'stt',
              status: 'error',
              message: connectionResult?.message ?? 'Azure Speech não pôde ser validado.',
            };

  const networkItem: HealthCheckItem = sttError
    ? {
        id: 'network',
        status: 'warn',
        message: 'Configuração do Azure ausente. O teste de rede do STT foi ignorado.',
      }
    : !args.includeExternalAzureCheck
      ? {
          id: 'network',
          status: 'warn',
          message:
            'Diagnóstico online do Azure não executado nesta abertura. Rode o teste manual para validar rede e autenticação.',
        }
      : connectionResult?.status === 'network-error'
        ? {
            id: 'network',
            status: 'error',
            message: connectionResult.message,
          }
        : {
            id: 'network',
            status: 'ok',
            message:
              connectionResult?.host != null
                ? `Conectividade com o Azure validada (${connectionResult.host}).`
                : 'Conectividade com o Azure pronta para validação.',
          };

  const hookItem = checkHookHealth({
    holdToTalkEnabled: args.holdToTalkEnabled,
    holdHookActive: args.holdHookActive,
  });
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
      : args.historyStorageMode === 'plain' ||
          !args.isEncryptionAvailable ||
          args.azureCredentialStorageMode === 'plain'
        ? 'warn'
        : 'ok';
  const securityMessages = [
    args.runtimeSecurity.cspEnabled
      ? 'CSP em tempo de execução ativa.'
      : 'CSP em tempo de execução desativada.',
    args.runtimeSecurity.permissionsPolicy === 'default-deny'
      ? 'Permissões no modo default deny.'
      : 'Permissões fora do modo estrito.',
    args.historyStorageMode === 'encrypted'
      ? 'Histórico protegido com criptografia.'
      : 'Histórico armazenado em texto simples.',
    args.isEncryptionAvailable
      ? 'safeStorage disponível.'
      : 'safeStorage indisponível neste ambiente.',
    args.azureCredentialStorageMode === 'plain'
      ? 'Credenciais legadas do Azure ainda estão em texto simples; regrave-as em um ambiente com safeStorage.'
      : null,
  ];
  const securityItem: HealthCheckItem = {
    id: 'security',
    status: securityStatus,
    message: securityMessages.filter(Boolean).join(' '),
  };
  const microphoneItem: HealthCheckItem = args.microphone
    ? {
        id: 'microphone',
        status: args.microphone.status,
        message: args.microphone.message,
      }
    : {
        id: 'microphone',
        status: 'warn',
        message: 'O estado do microfone ainda não foi informado pelo renderer.',
      };

  return {
    generatedAt: new Date().toISOString(),
    items: [
      sttItem,
      networkItem,
      hookItem,
      microphoneItem,
      historyItem,
      phraseItem,
      injectionItem,
      securityItem,
    ],
  };
}
