export type HotkeyMode = 'hold' | 'toggle-primary' | 'toggle-fallback' | 'unavailable';

export function hotkeyLabelFromAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const key = token.toLowerCase();
      if (key === 'commandorcontrol' || key === 'ctrl' || key === 'control') return 'Ctrl';
      if (key === 'super' || key === 'meta' || key === 'command') return 'Win';
      if (key === 'space') return 'Space';
      return token.length <= 1 ? token.toUpperCase() : token;
    })
    .join('+');
}

export function pickToggleHotkeyMode(
  primaryRegistered: boolean,
  fallbackRegistered: boolean,
): HotkeyMode {
  if (primaryRegistered) return 'toggle-primary';
  if (fallbackRegistered) return 'toggle-fallback';
  return 'unavailable';
}
