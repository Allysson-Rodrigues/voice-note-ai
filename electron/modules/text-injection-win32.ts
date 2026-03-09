import { spawn } from "node:child_process";
import {
  RETRY_SLEEP_MS,
  retryBooleanOperation,
  retryPromiseOperation,
  sleep,
} from "./text-injection-support.js";

const RESOLVE_WINDOW_RETRIES = 2;
const WINDOW_PASTE_RETRIES = 2;
const KEYBOARD_PASTE_RETRIES = 2;

export type ResolvedWindowInfo = {
  targetReady: boolean;
  currentHandle: string | null;
  appKey: string | null;
};

async function runPowerShell(command: string, timeoutMs = 900) {
  return await new Promise<string>((resolve, reject) => {
    const ps = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-Command",
        command,
      ],
      { windowsHide: true },
    );

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      try {
        ps.kill();
      } catch {
        // ignore
      }
      reject(new Error("powershell timeout"));
    }, timeoutMs);

    ps.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    ps.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    ps.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    ps.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(
          new Error(
            stderr || `powershell exited with code ${code ?? "unknown"}`,
          ),
        );
      }
    });
  });
}

export async function getForegroundWindowHandle() {
  if (process.platform !== "win32") return null;

  const script = [
    '$ErrorActionPreference = "Stop"',
    'if (-not ("VoiceNote.NativeWin32" -as [type])) {',
    'Add-Type -Namespace VoiceNote -Name NativeWin32 -MemberDefinition @"',
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    "  public static extern System.IntPtr GetForegroundWindow();",
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    "  public static extern bool SetForegroundWindow(System.IntPtr hWnd);",
    '"@ }',
    "$h = [VoiceNote.NativeWin32]::GetForegroundWindow()",
    "$raw = $h.ToInt64()",
    '[Console]::Out.Write((@{ handle = "$raw" } | ConvertTo-Json -Compress))',
  ].join("; ");

  try {
    const raw = await runPowerShell(script);
    const parsed = JSON.parse(raw) as { handle?: string };
    if (!parsed.handle || parsed.handle === "0") return null;
    return parsed.handle;
  } catch {
    return null;
  }
}

export async function getWindowAppKeyByHandle(handle: string | null) {
  if (process.platform !== "win32" || !handle) return null;
  const normalized = handle.trim();
  if (!/^-?\d+$/.test(normalized)) return null;

  const script = [
    '$ErrorActionPreference = "Stop"',
    'if (-not ("VoiceNote.NativeWin32Proc" -as [type])) {',
    'Add-Type -Namespace VoiceNote -Name NativeWin32Proc -MemberDefinition @"',
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    "  public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint lpdwProcessId);",
    '"@ }',
    `$h = [System.IntPtr]::new([int64]${normalized})`,
    "$pid = 0",
    "[void][VoiceNote.NativeWin32Proc]::GetWindowThreadProcessId($h, [ref]$pid)",
    'if ($pid -eq 0) { [Console]::Out.Write((@{ app = "" } | ConvertTo-Json -Compress)); exit 0 }',
    "$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue",
    'if (-not $proc) { [Console]::Out.Write((@{ app = "" } | ConvertTo-Json -Compress)); exit 0 }',
    "$name = $proc.ProcessName",
    'if (-not $name) { $name = "" }',
    "[Console]::Out.Write((@{ app = $name } | ConvertTo-Json -Compress))",
  ].join("; ");

  try {
    const raw = await runPowerShell(script, 1100);
    const parsed = JSON.parse(raw) as { app?: string };
    const app = (parsed.app ?? "").trim();
    return app ? app.toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function resolveTargetWindowInfo(
  targetWindowHandle: string | null,
): Promise<ResolvedWindowInfo> {
  if (process.platform !== "win32") {
    return { targetReady: true, currentHandle: null, appKey: null };
  }

  const target = targetWindowHandle?.trim() ?? "";
  const hasTarget = Boolean(target && /^-?\d+$/.test(target));

  const focusLines = hasTarget
    ? [
        `$target = [int64]${target}`,
        "if ($current -ne $target) {",
        "  [void][VoiceNote.NativeWin32All]::SetForegroundWindow([System.IntPtr]::new($target))",
        "  Start-Sleep -Milliseconds 50",
        "  $current = [VoiceNote.NativeWin32All]::GetForegroundWindow().ToInt64()",
        "  $ready = ($current -eq $target)",
        "}",
      ]
    : [];

  const script = [
    '$ErrorActionPreference = "Stop"',
    'if (-not ("VoiceNote.NativeWin32All" -as [type])) {',
    'Add-Type -Namespace VoiceNote -Name NativeWin32All -MemberDefinition @"',
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    "  public static extern System.IntPtr GetForegroundWindow();",
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    "  public static extern bool SetForegroundWindow(System.IntPtr hWnd);",
    '  [System.Runtime.InteropServices.DllImport("user32.dll")]',
    "  public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint lpdwProcessId);",
    '"@ }',
    "$current = [VoiceNote.NativeWin32All]::GetForegroundWindow().ToInt64()",
    "$ready = $true",
    ...focusLines,
    '$app = ""',
    "$wpid = 0",
    "[void][VoiceNote.NativeWin32All]::GetWindowThreadProcessId([System.IntPtr]::new($current), [ref]$wpid)",
    "if ($wpid -ne 0) {",
    "  $proc = Get-Process -Id $wpid -ErrorAction SilentlyContinue",
    "  if ($proc -and $proc.ProcessName) { $app = $proc.ProcessName }",
    "}",
    '[Console]::Out.Write((@{ handle = "$current"; ready = [bool]$ready; app = $app } | ConvertTo-Json -Compress))',
  ].join("; ");

  for (let attempt = 1; attempt <= RESOLVE_WINDOW_RETRIES; attempt += 1) {
    try {
      const raw = await runPowerShell(script, 1500);
      const parsed = JSON.parse(raw) as {
        handle?: string;
        ready?: boolean;
        app?: string;
      };
      const result = {
        targetReady: parsed.ready !== false,
        currentHandle:
          parsed.handle && parsed.handle !== "0" ? parsed.handle : null,
        appKey: parsed.app ? parsed.app.toLowerCase() : null,
      };
      if (result.targetReady || attempt >= RESOLVE_WINDOW_RETRIES) {
        return result;
      }
    } catch {
      if (attempt >= RESOLVE_WINDOW_RETRIES) {
        return { targetReady: false, currentHandle: null, appKey: null };
      }
    }
    await sleep(RETRY_SLEEP_MS);
  }

  return { targetReady: false, currentHandle: null, appKey: null };
}

export async function windowsSendCtrlV() {
  const script = [
    '$ErrorActionPreference = "Stop"',
    "$wshell = New-Object -ComObject WScript.Shell",
    "Start-Sleep -Milliseconds 40; $wshell.SendKeys('^v')",
  ].join("; ");
  await retryPromiseOperation(
    async () => {
      await runPowerShell(script, 1000);
    },
    KEYBOARD_PASTE_RETRIES,
    RETRY_SLEEP_MS,
  );
}

export async function windowsSendShiftInsert() {
  const script = [
    '$ErrorActionPreference = "Stop"',
    "$wshell = New-Object -ComObject WScript.Shell",
    "Start-Sleep -Milliseconds 40; $wshell.SendKeys('+{INSERT}')",
  ].join("; ");
  await retryPromiseOperation(
    async () => {
      await runPowerShell(script, 1000);
    },
    KEYBOARD_PASTE_RETRIES,
    RETRY_SLEEP_MS,
  );
}

export async function windowsPasteToHandle(handle: string) {
  const normalized = handle.trim();
  if (!/^-?\d+$/.test(normalized)) return false;

  const script = [
    '$ErrorActionPreference = "Stop"',
    'if (-not ("VoiceNote.NativeWin32" -as [type])) {',
    'Add-Type -Namespace VoiceNote -Name NativeWin32 -MemberDefinition @"',
    '  [System.Runtime.InteropServices.DllImport("user32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)]',
    "  public static extern System.IntPtr SendMessageW(System.IntPtr hWnd, uint Msg, System.IntPtr wParam, System.IntPtr lParam);",
    '"@ }',
    `$h = [System.IntPtr]::new([int64]${normalized})`,
    'if ($h -eq [System.IntPtr]::Zero) { throw "invalid handle" }',
    "[void][VoiceNote.NativeWin32]::SendMessageW($h, 0x0302, [System.IntPtr]::Zero, [System.IntPtr]::Zero)",
    "[Console]::Out.Write((@{ ok = $true } | ConvertTo-Json -Compress))",
  ].join("; ");

  return await retryBooleanOperation(
    async () => {
      try {
        await runPowerShell(script, 1000);
        return true;
      } catch {
        return false;
      }
    },
    WINDOW_PASTE_RETRIES,
    RETRY_SLEEP_MS,
  );
}
