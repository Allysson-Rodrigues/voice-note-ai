import { lookup as lookupDns, resolve as resolveDns } from 'node:dns/promises';

export const AZURE_CONFIG_MISSING_MESSAGE =
  'Azure STT nao configurado: defina AZURE_SPEECH_KEY e AZURE_SPEECH_REGION em .env.local.';

export type HealthStatus = 'ok' | 'warn' | 'error';

export type HealthCheckItem = {
  id: 'azure' | 'network' | 'hook';
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

async function checkNetworkHealth(): Promise<HealthCheckItem> {
  const azureConfigError = getAzureConfigError();
  if (azureConfigError) {
    return {
      id: 'network',
      status: 'warn',
      message: 'Sem regiao Azure configurada. Teste de rede para STT foi ignorado.',
    };
  }

  const region = (process.env.AZURE_SPEECH_REGION ?? '').trim().toLowerCase();
  const host = `${region}.stt.speech.microsoft.com`;
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
}): Promise<HealthCheckReport> {
  const azureError = getAzureConfigError();
  const azureItem: HealthCheckItem = azureError
    ? {
        id: 'azure',
        status: 'error',
        message: azureError,
      }
    : {
        id: 'azure',
        status: 'ok',
        message: 'Configuracao Azure STT valida.',
      };

  const hookItem = checkHookHealth({
    holdToTalkEnabled: args.holdToTalkEnabled,
    holdHookActive: args.holdHookActive,
  });
  const networkItem = await checkNetworkHealth();

  return {
    generatedAt: new Date().toISOString(),
    items: [azureItem, networkItem, hookItem],
  };
}
