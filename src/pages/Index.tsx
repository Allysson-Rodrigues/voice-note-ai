import type { ActiveTab, ExtendedStatus } from '@/components/index/types';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WindowTitleBar from '@/components/WindowTitleBar';
import { useToast } from '@/hooks/use-toast';
import {
  BookOpen,
  History,
  Mic,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import IndexTabPanels from './index/IndexTabPanels';
import { useIndexViewModel } from './index/useIndexViewModel';

const NAV_ITEMS: Array<{
  value: ActiveTab;
  label: string;
  icon: typeof Mic;
}> = [
  { value: 'capture', label: 'Captura', icon: Mic },
  { value: 'dictionary', label: 'Vocabulário', icon: BookOpen },
  { value: 'history', label: 'Histórico', icon: History },
  { value: 'settings', label: 'Configurações', icon: Settings },
];

const STATUS_LABELS: Record<ExtendedStatus | 'loading', string> = {
  idle: 'Pronto',
  listening: 'Ouvindo',
  finalizing: 'Finalizando',
  injecting: 'Inserindo',
  success: 'Concluído',
  error: 'Atenção',
  loading: 'Carregando...',
};

const STATUS_TONE_CLASS: Record<ExtendedStatus | 'loading', string> = {
  idle: 'bg-green-500/10 text-green-500',
  listening: 'bg-sky-500/10 text-sky-500',
  finalizing: 'bg-amber-500/10 text-amber-500',
  injecting: 'bg-violet-500/10 text-violet-500',
  success: 'bg-emerald-500/10 text-emerald-500',
  error: 'bg-red-500/10 text-red-500',
  loading: 'bg-yellow-500/10 text-yellow-500',
};

const STATUS_DOT_CLASS: Record<ExtendedStatus | 'loading', string> = {
  idle: 'bg-green-500',
  listening: 'bg-sky-500',
  finalizing: 'bg-amber-500',
  injecting: 'bg-violet-500',
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  loading: 'bg-yellow-500',
};

const Index = () => {
  const { toast } = useToast();
  const hasDesktopApi = typeof window !== 'undefined' && Boolean(window.voiceNoteAI);

  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('capture');

  useEffect(() => {
    const applyTheme = (t: 'light' | 'dark') => {
      if (t === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      setResolvedTheme(systemTheme);
      applyTheme(systemTheme);
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => {
        const nextTheme = e.matches ? 'dark' : 'light';
        setResolvedTheme(nextTheme);
        applyTheme(nextTheme);
      };
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    } else {
      setResolvedTheme(theme);
      applyTheme(theme);
    }
  }, [theme]);

  const vm = useIndexViewModel({
    activeTab,
    hasDesktopApi,
    toast,
  });
  const headerStatus: ExtendedStatus | 'loading' = vm.headerStatus;

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="mesh-gradient" />
      <div
        className="grid h-screen w-screen min-h-0"
        style={{ gridTemplateRows: isSidebarExpanded ? 'auto 1fr' : 'auto 1fr' }}
      >
        <header
          className={`titlebar-drag glass flex items-center justify-between px-8 py-4 ${
            isSidebarExpanded ? 'border-b border-border/40' : ''
          }`}
        >
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="titlebar-no-drag h-10 w-10 rounded-xl border border-border/40 bg-background/50"
              aria-label={isSidebarExpanded ? 'Recolher navegação' : 'Expandir navegação'}
              onClick={() => setIsSidebarExpanded((current) => !current)}
            >
              {isSidebarExpanded ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </Button>
            <h1 className="text-lg font-semibold text-foreground">Voice Note AI</h1>
          </div>
          <div className="flex items-center gap-4">
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1 ${STATUS_TONE_CLASS[headerStatus]}`}
            >
              <div className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASS[headerStatus]}`} />
              <span className="text-xs font-medium">{STATUS_LABELS[headerStatus]}</span>
            </div>
            <WindowTitleBar />
          </div>
        </header>
        <div
          className="grid min-h-0"
          style={{
            gridTemplateColumns: isSidebarExpanded ? '248px minmax(0, 1fr)' : '80px minmax(0, 1fr)',
          }}
        >
          <aside
            className={`glass flex min-h-0 flex-col overflow-y-auto border-r border-border/40 bg-[hsla(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))] ${
              isSidebarExpanded ? 'gap-4 p-4' : 'items-center gap-3 px-3 py-4'
            }`}
          >
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as ActiveTab)}
              orientation="vertical"
              className="w-full"
            >
              <TabsList className="w-full">
                {NAV_ITEMS.map(({ value, label, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className={`transition-all duration-200 ${
                      isSidebarExpanded
                        ? 'w-full justify-start'
                        : 'h-12 w-full justify-center rounded-2xl px-0'
                    }`}
                    aria-label={label}
                    title={label}
                  >
                    <Icon className={isSidebarExpanded ? 'mr-2 h-4 w-4' : 'h-4 w-4'} />
                    {isSidebarExpanded ? label : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {isSidebarExpanded ? (
              <div className="titlebar-no-drag mt-auto rounded-2xl border border-border/40 bg-background/50 p-2">
                <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Aparência
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={resolvedTheme === 'light' ? 'secondary' : 'ghost'}
                    className="justify-start rounded-xl"
                    onClick={() => setTheme('light')}
                    aria-pressed={resolvedTheme === 'light'}
                  >
                    <Sun className="mr-2 h-4 w-4" />
                    Claro
                  </Button>
                  <Button
                    variant={resolvedTheme === 'dark' ? 'secondary' : 'ghost'}
                    className="justify-start rounded-xl"
                    onClick={() => setTheme('dark')}
                    aria-pressed={resolvedTheme === 'dark'}
                  >
                    <Moon className="mr-2 h-4 w-4" />
                    Escuro
                  </Button>
                </div>
              </div>
            ) : (
              <div className="titlebar-no-drag mt-auto flex w-full flex-col items-center gap-2 rounded-[24px] border border-border/40 bg-background/50 px-2 py-3">
                <Button
                  variant={resolvedTheme === 'light' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-11 w-11 rounded-2xl"
                  onClick={() => setTheme('light')}
                  aria-label="Ativar modo claro"
                  aria-pressed={resolvedTheme === 'light'}
                  title="Modo claro"
                >
                  <Sun className="h-4 w-4" />
                </Button>
                <Button
                  variant={resolvedTheme === 'dark' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-11 w-11 rounded-2xl"
                  onClick={() => setTheme('dark')}
                  aria-label="Ativar modo escuro"
                  aria-pressed={resolvedTheme === 'dark'}
                  title="Modo escuro"
                >
                  <Moon className="h-4 w-4" />
                </Button>
              </div>
            )}
          </aside>
          <main className="min-h-0 overflow-hidden p-8">
            <IndexTabPanels
              activeTab={activeTab}
              hasDesktopApi={hasDesktopApi}
              onSetActiveTab={setActiveTab}
              onSetTheme={setTheme}
              theme={theme}
              vm={vm}
            />
          </main>
        </div>
      </div>
    </div>
  );
};

export default Index;
