import { describe, expect, it, vi } from 'vitest';
import { getAzureConfigMissingMessage, getHealthCheckReport } from './health-check.js';

describe('health check', () => {
  it('includes security status for strict runtime hardening', async () => {
    const report = await getHealthCheckReport({
      azureCredentialSource: 'secure-store',
      azureCredentials: {
        key: 'key',
        region: 'brazilsouth',
      },
      azureCredentialStorageMode: 'encrypted',
      includeExternalAzureCheck: true,
      testAzureConnection: async () => ({
        status: 'ok',
        message: 'ok',
        host: 'brazilsouth.api.cognitive.microsoft.com',
      }),
      holdToTalkEnabled: true,
      holdHookActive: true,
      historyEnabled: true,
      privacyMode: false,
      historyStorageMode: 'encrypted',
      isEncryptionAvailable: true,
      phraseBoostCount: 2,
      runtimeSecurity: {
        cspEnabled: true,
        permissionsPolicy: 'default-deny',
        trustedOrigins: ['file://'],
      },
      microphone: {
        status: 'ok',
        message: 'Microfone disponível.',
      },
      recentInjection: null,
    });

    const security = report.items.find((item) => item.id === 'security');
    const microphone = report.items.find((item) => item.id === 'microphone');
    expect(security?.status).toBe('ok');
    expect(microphone).toEqual({
      id: 'microphone',
      status: 'ok',
      message: 'Microfone disponível.',
    });
    expect(security?.message).toContain('CSP em tempo de execução ativa');
    expect(security?.message).toContain('default deny');
  });

  it('orients the user to secure settings or environment variables', () => {
    expect(getAzureConfigMissingMessage()).toContain('configurações do app');
    expect(getAzureConfigMissingMessage()).toContain('AZURE_SPEECH_KEY');
  });

  it('mantem o health-check local sem autenticar no Azure por padrao', async () => {
    const testAzureConnection = vi.fn(async () => ({
      status: 'ok' as const,
      message: 'ok',
      host: 'brazilsouth.api.cognitive.microsoft.com',
    }));

    const report = await getHealthCheckReport({
      azureCredentialSource: 'secure-store',
      azureCredentialStorageMode: 'encrypted',
      azureCredentials: {
        key: 'key',
        region: 'brazilsouth',
      },
      testAzureConnection,
      holdToTalkEnabled: true,
      holdHookActive: true,
      historyEnabled: true,
      privacyMode: false,
      historyStorageMode: 'encrypted',
      isEncryptionAvailable: true,
      phraseBoostCount: 1,
      runtimeSecurity: {
        cspEnabled: true,
        permissionsPolicy: 'default-deny',
        trustedOrigins: ['file://'],
      },
      recentInjection: null,
    });

    expect(testAzureConnection).not.toHaveBeenCalled();
    expect(report.items.find((item) => item.id === 'stt')?.status).toBe('warn');
    expect(report.items.find((item) => item.id === 'network')?.status).toBe('warn');
  });
});
