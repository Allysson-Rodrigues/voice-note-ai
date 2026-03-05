import { Copy, Minus, Square, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const WindowTitleBar = () => {
  const hasDesktopApi = typeof window !== 'undefined' && Boolean(window.voiceNoteAI);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!hasDesktopApi) return;
    void window.voiceNoteAI.isWindowMaximized().then(setIsMaximized);
    const off = window.voiceNoteAI.onMaximizedChange(setIsMaximized);
    return off;
  }, [hasDesktopApi]);

  const onMinimize = useCallback(() => {
    if (hasDesktopApi) window.voiceNoteAI.windowMinimize();
  }, [hasDesktopApi]);

  const onMaximize = useCallback(() => {
    if (hasDesktopApi) window.voiceNoteAI.windowMaximize();
  }, [hasDesktopApi]);

  const onClose = useCallback(() => {
    if (hasDesktopApi) window.voiceNoteAI.windowClose();
  }, [hasDesktopApi]);

  if (!hasDesktopApi) return null;

  return (
    <div className="titlebar-no-drag flex items-center">
      <button
        type="button"
        onClick={onMinimize}
        className="flex h-9 w-[46px] items-center justify-center text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        aria-label="Minimizar"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onMaximize}
        className="flex h-9 w-[46px] items-center justify-center text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        aria-label={isMaximized ? 'Restaurar' : 'Maximizar'}
      >
        {isMaximized ? <Copy className="h-3.5 w-3.5 rotate-180" /> : <Square className="h-3 w-3" />}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="flex h-9 w-[46px] items-center justify-center text-muted-foreground transition-colors duration-150 hover:bg-red-500/90 hover:text-white"
        aria-label="Fechar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default WindowTitleBar;
