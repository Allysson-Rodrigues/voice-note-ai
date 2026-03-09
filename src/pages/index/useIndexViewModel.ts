import type { ActiveTab, ExtendedStatus } from "@/components/index/types";
import { useAdaptiveSuggestions } from "@/hooks/useAdaptiveSuggestions";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useDictionary } from "@/hooks/useDictionary";
import { useHistory } from "@/hooks/useHistory";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import type { AppToast } from "@/hooks/app-toast";

type UseIndexViewModelOptions = {
  activeTab: ActiveTab;
  hasDesktopApi: boolean;
  toast: AppToast;
};

export function useIndexViewModel({
  activeTab,
  hasDesktopApi,
  toast,
}: UseIndexViewModelOptions) {
  const history = useHistory({
    activeTab,
    hasDesktopApi,
    toast,
  });
  const voiceSession = useVoiceSession({
    activeTab,
    hasDesktopApi,
    toast,
  });
  const appSettings = useAppSettings({
    hasDesktopApi,
    toast,
    onHealthCheck: voiceSession.runHealthCheck,
    onHistoryRefresh: history.refreshHistory,
  });
  const adaptive = useAdaptiveSuggestions({
    activeTab,
    hasDesktopApi,
    toast,
  });
  const dictionary = useDictionary({
    activeTab,
    hasDesktopApi,
    toast,
  });

  const headerStatus: ExtendedStatus | "loading" =
    appSettings.appStatus === "loading"
      ? "loading"
      : voiceSession.error
        ? "error"
        : voiceSession.status === "idle"
          ? "idle"
          : voiceSession.status;

  return {
    adaptive,
    appSettings,
    dictionary,
    headerStatus,
    history,
    voiceSession,
  };
}
