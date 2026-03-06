import { describe, expect, it } from 'vitest';
import { getAzureConfigMissingMessage, getHealthCheckReport } from './health-check.js';

describe('health check', () => {
  it('includes security status for strict runtime hardening', async () => {
    process.env.AZURE_SPEECH_KEY = 'key';
    process.env.AZURE_SPEECH_REGION = 'brazilsouth';

    const report = await getHealthCheckReport({
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
      recentInjection: null,
    });

    const security = report.items.find((item) => item.id === 'security');
    expect(security?.status).toBe('ok');
    expect(security?.message).toContain('CSP em tempo de execução ativa');
    expect(security?.message).toContain('default deny');
  });

  it('adapts the Azure guidance for installed apps', () => {
    expect(getAzureConfigMissingMessage()).toContain('.env.local');
    expect(getAzureConfigMissingMessage({ isPackaged: true })).toContain(
      'variáveis de ambiente do sistema',
    );
  });
});
