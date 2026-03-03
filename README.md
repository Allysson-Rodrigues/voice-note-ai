# Voice Note AI (Windows-first, uso pessoal)

Ditado universal (Electron) com hotkey global que:

- inicia/para a captura do microfone
- streama PCM 16kHz mono para o Azure Speech-to-Text
- copia o texto final para o clipboard
- no Windows, tenta colar automaticamente via `WM_PASTE` (handle alvo/foreground) com fallback `Ctrl+V` e `Shift+Insert`
- mostra HUD em janela dedicada (`hud.html`) transparente e always-on-top

## Setup (dev)

1. Crie um arquivo `.env.local` (use `.env.example` como base)

2. Instale deps e rode:

```bash
npm ci --workspaces=false
npm run dev:desktop
```

## Configuração Azure no app instalado (.exe)

Para o app já instalado no Windows, configure as variáveis no sistema (não apenas no `.env.local`):

1. Abra **Editar as variáveis de ambiente do sistema**.
2. Em **Variáveis de usuário**, adicione/edite:
   - `AZURE_SPEECH_KEY`
   - `AZURE_SPEECH_REGION` (ex.: `brazilsouth`)
   - opcional: `AZURE_SPEECH_LANGUAGE=pt-BR`
3. Feche o app pela bandeja (**Quit**) e faça logoff/login (ou reinicie o Windows Explorer).
4. Reabra o app e rode **Health Check**.

Observação: no `.exe` empacotado, o `.env.local` não é a fonte mais confiável para variáveis de runtime do usuário final.

## Quality Gate (clean code)

```bash
# gate recomendado para CI/local (lint + typecheck + coverage + ciclos + arquivos órfãos)
npm run quality

# versão estrita (inclui prettier no repo inteiro)
npm run quality:strict
```

## Empacotar instalador Windows (.exe)

Pré-requisitos:

- Rodar o empacotamento no **Windows** (PowerShell/CMD), não no Linux puro.
- Node.js + npm instalados.
- Dependências instaladas (`npm ci --workspaces=false`).
- Variáveis Azure configuradas no ambiente do Windows (`AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`).

Comandos:

```bash
# build app (renderer + electron main)
npm run build:desktop

# gera instalador NSIS em release/
npm run dist:win
```

Importante:

- Rode os comandos na pasta do projeto (onde existe `package.json`), por exemplo:

```powershell
cd C:\Users\allys\dev\voice-note-ai
```

Saída esperada (pasta `release/`):

- `Voice Note AI-Setup-1.0.0.exe`
- artefatos auxiliares (`latest.yml`, `.blockmap`) para auto-update futuro.

Observações:

- O instalador usa upgrade in-place (mesmo `appId`/`productName`).
- Sem assinatura de código, o Windows SmartScreen pode exibir alerta. Para distribuição ampla, use code signing.
- Para abrir o instalador no PowerShell, use caminho entre aspas por causa de espaços no nome:

```powershell
& ".\release\Voice Note AI-Setup-1.0.0.exe"
```

## Atualização de versão (patch/minor/major)

Fluxo recomendado:

```bash
# 1) subir versão sem criar tag automática
npm version patch --no-git-tag-version

# 2) validar qualidade
npm run quality

# 3) gerar novo instalador
npm run dist:win
```

Notas de update:

- Instalar a nova versão por cima da anterior (NSIS faz upgrade).
- Antes de mudanças grandes, faça backup de `%APPDATA%\voice-note-ai\settings.json`, `%APPDATA%\voice-note-ai\dictionary.json` e `%APPDATA%\voice-note-ai\history.json`.

## Hotkey / comportamento

- Hotkey default: `Ctrl+Win` (`CommandOrControl+Super`)
- Em plataformas não-Windows, existe fallback para `Ctrl+Win+Space` (`CommandOrControl+Super+Space`) se a primária falhar
- Para customizar:
  - `VOICE_HOTKEY="CommandOrControl+Super"`
  - `VOICE_HOTKEY_FALLBACK="CommandOrControl+Super+Space"`
- Hold-to-talk (segurar/soltar):
  - default ligado (`VOICE_HOLD_TO_TALK=1`) no Windows com `uiohook-napi`
  - no Windows, se o hook não carregar, a captura fica bloqueada (sem fallback toggle)
  - default usa modificadores (`Ctrl + Win`) sem keycode fixo
  - se precisar forçar keycodes, use `VOICE_HOLD_KEYCODES` (ex: `29,3675`)
- Auto-paste (Windows):
  - padrão recomendado: ligado (`VOICE_AUTO_PASTE=1`)
  - o `VOICE_AUTO_PASTE` define o default inicial quando o settings local ainda não existe
  - o fluxo usa mutex e restauração segura de clipboard (não sobrescreve cópia nova do usuário)

## Estilo de texto e correções inteligentes

- Perfis de escrita:
  - `formal`: pontuação e normalização mais forte
  - `casual`: equilíbrio entre naturalidade e legibilidade
  - `very-casual`: mantém tom coloquial e reduz formalização
- O app aplica correções canônicas pós-STT (ex.: `workspace -> Workspace`, `antigravity -> Antigravity`).
- Você pode ajustar essas regras no tab **Dicionário > Correções inteligentes**.

## Troubleshooting de hotkey (Windows)

- Se a hotkey não registrar, o app mostra erro com o motivo atual.
- Se `uiohook-napi` falhar no Windows, o app mostra erro e bloqueia captura até corrigir o hook.
- Execute o app como administrador para testar conflito de privilégio.
- Verifique atalhos globais já ocupando `Ctrl+Win`.
- Ative `VOICE_HOLD_KEYCODES` apenas se o layout/teclado não responder bem com detecção por modificadores.

## Troubleshooting de build/instalação (Windows)

- `npm ERR! enoent ... package.json`: você está em pasta errada; rode `cd` para o diretório do projeto.
- `release\Voice ... could not be loaded`: no PowerShell, use `&` + caminho entre aspas para executar o `.exe`.
- `Falha na captura: Unable to load a worklet's module.`: gere instalador atualizado (`npm run build:desktop && npm run dist:win`) e reinstale por cima.

## Latência e confiabilidade

- O app mantém perfil de latência equilibrado (`stopGraceMs=200`).
- Timeout de sessão: `90s` (configurável em settings store).
- Retry automático STT: 1 tentativa para falhas recuperáveis em sessões curtas (<30s), com replay de buffer local.
- Telemetria no log:
  - `ptt_to_first_partial_ms`
  - `ptt_to_final_ms`
  - `inject_total_ms`
  - `resolve_window_ms`
  - `paste_attempt_ms`
  - `clipboard_restore_ms`
  - `retry_count`
  - `session_duration_ms`

## Histórico local

- O app salva transcrições finais localmente (aba **Histórico**) por padrão.
- Configuração padrão:
  - histórico habilitado
  - retenção de 30 dias
- Operações suportadas:
  - busca por texto
  - copiar uma transcrição
  - remover item específico
  - limpar histórico completo
- Persistência: `%APPDATA%\voice-note-ai\history.json`

## Comandos de formatação (PT+EN)

- O pós-processamento entende comandos explícitos:
  - `bullet point` / `bullet` / `tópico` / `topico` -> `•`
  - `item 1` / `número 1` / `numero 1` / `number 1` -> `1.`
  - `nova linha` / `new line` -> quebra de linha
- A opção pode ser ligada/desligada em **Configurações**.

## Ícone do app

- Fonte do ícone: `assets/icons/app-icon.svg`
- Geração de ícones:

```bash
npm run icons:generate
```

- Saída:
  - `public/favicon.png`
  - `public/favicon.ico`

## Atualizar do WSL para Windows

No WSL:

```bash
cd /home/allysson/projetos/01-projetos/voice-note-ai
rsync -a --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude dist \
  --exclude electron-dist \
  --exclude .env.local \
  ./ /mnt/c/Users/allys/dev/voice-note-ai/
```

No Windows (PowerShell ou CMD):

```bash
cd C:\Users\allys\dev\voice-note-ai
npm ci --workspaces=false
npm run dev:desktop
```

Checklist pós-sync:

- hotkey `Ctrl+Win` entra em `Listening` e ao soltar vai para `Finalizing` -> `Idle`
- em Windows, o hook global carrega sem bloquear captura
- HUD permanece acima dos apps
- ditado funciona em Notepad/Slack/VS Code

## “Vai parecer hack?”

- Em apps comuns (Notepad, Slack, Chrome) normalmente funciona sem drama.
- Dois pontos podem chamar atenção:
  1. **Hook global de teclado** (parece “keylogger” para alguns antivírus, embora aqui a gente só use para detectar o chord e iniciar/parar a gravação).
  2. **Auto-paste** (simulação de `Ctrl+V`) pode falhar em apps/janelas “protegidas” ou com políticas restritas.
- Por isso o MVP mantém fallback seguro: **sempre copia pro clipboard**; auto-paste é opcional.

## Azure Speech (env vars)

- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`
- opcional: `AZURE_SPEECH_LANGUAGE` (default: `pt-BR`)
- opcional: `VOICE_PHRASES` (lista separada por vírgula com gírias/termos em inglês/nome de apps)
- `VOICE_HUD` (default: `1`) mostra um indicador always-on-top no canto inferior direito (perto da taskbar)
- `VOICE_HUD_DEBUG=1` transforma o HUD em janela normal (com frame/devtools) para debug se algo não aparecer
- `VOICE_MAX_SESSION_SECONDS` (default: `90`)
- `VOICE_HISTORY_ENABLED` (default: `1`) habilita histórico local
- `VOICE_HISTORY_RETENTION_DAYS` (default: `30`) retenção do histórico
