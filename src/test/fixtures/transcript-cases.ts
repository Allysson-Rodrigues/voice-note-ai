export type TranscriptCase = {
  name: string;
  input: string;
  toneMode: "formal" | "casual" | "very-casual";
  formatCommandsEnabled: boolean;
  expected: string;
};

export const canonicalTermsFixture = [
  { from: "work space|workspace|work-space", to: "Workspace", enabled: true },
  {
    from: "anti gravity|anti-gravity|antigravity",
    to: "Antigravity",
    enabled: true,
  },
];

export const transcriptCases: TranscriptCase[] = [
  {
    name: "applies explicit bullet commands in pt/en",
    input:
      "bullet point revisar o workspace nova linha topico corrigir antigravity",
    toneMode: "casual",
    formatCommandsEnabled: true,
    expected: "• revisar o Workspace\n• corrigir Antigravity",
  },
  {
    name: "applies explicit numbered item commands",
    input: "item 1 revisar contrato nova linha número 2 enviar proposta",
    toneMode: "formal",
    formatCommandsEnabled: true,
    expected: "1. revisar contrato\n2. enviar proposta",
  },
  {
    name: "keeps plain formatting when explicit command mode is disabled",
    input: "item 1 revisar contrato",
    toneMode: "casual",
    formatCommandsEnabled: false,
    expected: "Item 1 revisar contrato",
  },
  {
    name: "applies pt-br punctuation commands",
    input:
      "Olá vírgula tudo bem interrogação nova linha abre parênteses teste fecha parênteses ponto",
    toneMode: "casual",
    formatCommandsEnabled: true,
    expected: "Olá, tudo bem?\n(teste).",
  },
  {
    name: "applies bracket and dash commands",
    input: "abre colchetes teste fecha colchetes travessão ok",
    toneMode: "casual",
    formatCommandsEnabled: true,
    expected: "[teste] — ok",
  },
  {
    name: "handles ponto final explicitly",
    input: "oi ponto final",
    toneMode: "formal",
    formatCommandsEnabled: true,
    expected: "Oi.",
  },
  {
    name: "preserves acronyms in very casual mode",
    input: "NASA inicia testes",
    toneMode: "very-casual",
    formatCommandsEnabled: true,
    expected: "NASA inicia testes",
  },
];
