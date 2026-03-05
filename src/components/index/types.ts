import type { HealthStatus } from '@/electron';

export type Status = 'idle' | 'listening' | 'finalizing' | 'error';
export type ExtendedStatus = Status | 'injecting' | 'success';
export type ActiveTab = 'capture' | 'dictionary' | 'history' | 'settings';
export type AudioDevice = { deviceId: string; label: string };
export type ToneMode = 'formal' | 'casual' | 'very-casual';
export type LanguageMode = 'pt-BR' | 'en-US' | 'dual';

export type UiHealthItem = {
  id: 'stt' | 'network' | 'hook' | 'history' | 'phrases' | 'injection' | 'security' | 'microphone';
  status: HealthStatus;
  message: string;
};
