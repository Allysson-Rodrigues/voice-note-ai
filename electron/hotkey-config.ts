export type HoldHotkeyChord = {
  accelerator: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  keys: number[];
};

const ACCELERATOR_ALIASES: Record<string, string> = {
  commandorcontrol: "CommandOrControl",
  control: "Control",
  ctrl: "Control",
  cmdorctrl: "CommandOrControl",
  command: "Command",
  meta: "Meta",
  super: "Super",
  win: "Super",
  windows: "Super",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  space: "Space",
};

const UI_LABELS: Record<string, string> = {
  CommandOrControl: "Ctrl",
  Control: "Ctrl",
  Command: "Win",
  Meta: "Win",
  Super: "Win",
  Alt: "Alt",
  Shift: "Shift",
  Space: "Space",
};

const HOLD_KEYCODE_MAP: Record<string, number> = {
  Space: 57,
  Backspace: 14,
  Tab: 15,
  Enter: 28,
  Escape: 1,
  Semicolon: 39,
  Equal: 13,
  Comma: 51,
  Minus: 12,
  Period: 52,
  Slash: 53,
  Backquote: 41,
  BracketLeft: 26,
  Backslash: 43,
  BracketRight: 27,
  Quote: 40,
  ArrowLeft: 57419,
  ArrowUp: 57416,
  ArrowRight: 57421,
  ArrowDown: 57424,
  Insert: 3666,
  Delete: 3667,
  Home: 3655,
  End: 3663,
  PageUp: 3657,
  PageDown: 3665,
};

for (const digit of "0123456789") {
  HOLD_KEYCODE_MAP[digit] = digit === "0" ? 11 : Number(digit) + 1;
}

const LETTER_KEYCODES = [
  30, 48, 46, 32, 18, 33, 34, 35, 23, 36, 37, 38, 50, 49, 24, 25, 16, 19, 31,
  20, 22, 47, 17, 45, 21, 44,
];

for (let index = 0; index < 26; index += 1) {
  HOLD_KEYCODE_MAP[String.fromCharCode(65 + index)] =
    LETTER_KEYCODES[index] ?? 0;
}

function normalizeToken(rawToken: string) {
  const compact = rawToken.trim();
  if (!compact) return null;

  const alias = ACCELERATOR_ALIASES[compact.toLowerCase()];
  if (alias) return alias;

  if (/^[a-z]$/i.test(compact)) return compact.toUpperCase();
  if (/^[0-9]$/.test(compact)) return compact;

  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(compact)) {
    return compact.toUpperCase();
  }

  if (
    compact === "ArrowLeft" ||
    compact === "ArrowUp" ||
    compact === "ArrowRight" ||
    compact === "ArrowDown"
  ) {
    return compact;
  }

  if (
    compact === "Backspace" ||
    compact === "Tab" ||
    compact === "Enter" ||
    compact === "Escape" ||
    compact === "Insert" ||
    compact === "Delete" ||
    compact === "Home" ||
    compact === "End" ||
    compact === "PageUp" ||
    compact === "PageDown" ||
    compact === "Semicolon" ||
    compact === "Equal" ||
    compact === "Comma" ||
    compact === "Minus" ||
    compact === "Period" ||
    compact === "Slash" ||
    compact === "Backquote" ||
    compact === "BracketLeft" ||
    compact === "Backslash" ||
    compact === "BracketRight" ||
    compact === "Quote"
  ) {
    return compact;
  }

  return null;
}

function tokenizeAccelerator(value: string) {
  const tokens = value
    .split("+")
    .map((entry) => normalizeToken(entry))
    .filter((entry): entry is string => Boolean(entry));

  return [...new Set(tokens)];
}

export function normalizeHotkeyAccelerator(value: string) {
  const tokens = tokenizeAccelerator(value);
  if (tokens.length < 2) {
    throw new Error("O atalho precisa ter pelo menos duas teclas.");
  }

  const modifierCount = tokens.filter(
    (token) =>
      token === "CommandOrControl" ||
      token === "Control" ||
      token === "Alt" ||
      token === "Shift" ||
      token === "Meta" ||
      token === "Command" ||
      token === "Super",
  ).length;

  if (modifierCount === 0) {
    throw new Error(
      "O atalho precisa incluir ao menos uma tecla modificadora.",
    );
  }

  if (tokens.length > 4) {
    throw new Error("O atalho excede o limite de quatro teclas.");
  }

  return tokens.join("+");
}

export function hotkeyLabelFromAccelerator(accelerator: string) {
  const tokens = tokenizeAccelerator(accelerator);
  return tokens.map((token) => UI_LABELS[token] ?? token).join("+");
}

export function parseHoldHotkeyChord(accelerator: string): HoldHotkeyChord {
  const normalized = normalizeHotkeyAccelerator(accelerator);
  const tokens = normalized.split("+");
  const keys: number[] = [];
  let ctrl = false;
  let alt = false;
  let shift = false;
  let meta = false;

  for (const token of tokens) {
    if (token === "CommandOrControl" || token === "Control") {
      ctrl = true;
      continue;
    }
    if (token === "Alt") {
      alt = true;
      continue;
    }
    if (token === "Shift") {
      shift = true;
      continue;
    }
    if (token === "Meta" || token === "Command" || token === "Super") {
      meta = true;
      continue;
    }

    const keycode = HOLD_KEYCODE_MAP[token];
    if (!keycode) {
      throw new Error(
        `A tecla ${token} nao e suportada para hold-to-talk no Windows.`,
      );
    }
    keys.push(keycode);
  }

  if (!ctrl && !alt && !shift && !meta) {
    throw new Error(
      "O atalho precisa incluir ao menos uma tecla modificadora.",
    );
  }

  return {
    accelerator: normalized,
    ctrl,
    alt,
    shift,
    meta,
    keys,
  };
}
