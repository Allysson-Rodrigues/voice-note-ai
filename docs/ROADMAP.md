# Projeto: “Wispr Flow-like” (Windows-first) com Ditado Universal (MVP: transcrição)

## Resumo (o que vamos construir)
Um app desktop (Windows-first) que:
1. Roda em background (tray).
2. Ativa “push-to-talk” ao segurar um atalho de 2 teclas (configurável).
3. Enquanto o atalho está pressionado, captura áudio do microfone e envia para STT em cloud (Azure Speech).
4. Ao soltar o atalho, finaliza a transcrição e insere o texto no app atualmente focado (clipboard + Ctrl+V, com fallback para “só copiar”).
5. Fase 2: adicionar tradução (opcional) depois do MVP estabilizado.

**Decisões fechadas:**
- **Plataforma:** desktop systemwide (não web).
- **Primeiro OS:** Windows.
- **Shell:** Electron + Vite + React + TypeScript.
- **STT:** Azure Speech-to-Text (cloud).
- **Interação:** segurar (2 teclas) para gravar, soltar para inserir.
- **Local do projeto:** `01-projetos/voice-note-ai` (rebranding do repositório).

## Por que isso é “difícil”
- MVP é viável (moderado): STT streaming + hotkey + tray + clipboard/paste.
- As partes mais "chatinhas": áudio low-latency (resample/PCM), confiabilidade de injeção de texto (permissões/antivírus), UX de estados (ouvindo, sem mic, sem rede), e privacidade/segredos.

## Requisitos (o que você precisa ter)
- Conta Azure com Speech resource (key + region).
- Windows dev env (Node LTS recomendado; aqui você já tem Node 24).
- Permissão de microfone no Windows.
- Decidir política de dados: no MVP, não persistir áudio; opcionalmente histórico de transcrições local.

## Stack / Frameworks (MVP)
- Desktop: Electron (main process Node) + Vite + React (renderer) + TypeScript strict.
- UI: Tailwind (opcional) ou CSS modules; estado: Zustand (ou React state).
- Audio capture: WebAudio no renderer (AudioWorklet) + resampler para 16kHz mono PCM.
- Cloud STT: Azure Speech SDK rodando no main process.
- Segredos: `keytar` (Windows Credential Manager) para guardar Azure key/region.
- Observabilidade: logs locais (rotacionados) + modo debug.

## Arquitetura (componentes e responsabilidades)
1. **Electron Main**
   - `globalShortcut`: registra atalho “hold-to-talk” (ex: `Ctrl+Win`, com fallback `Ctrl+Win+Space`, ou chord configurável).
   - `Tray`: menu (Start/Stop, Settings, Quit).
   - **Azure STT Client**:
     - recebe chunks PCM do renderer via IPC.
     - streama para Azure.
     - emite eventos: partial transcript, final transcript, errors.
   - **Text Injection**:
     - “Paste mode”: salva clipboard atual, seta clipboard = transcript, envia Ctrl+V para janela ativa, restaura clipboard (com timeout/try-finally).
     - Fallback: somente copia + toast “Pressione Ctrl+V”.
   - **Config/Secure Store**:
     - key/region no keytar; preferências no `app.getPath('userData')/config.json`.

2. **Electron Renderer (React UI)**
   - Tela Settings: hotkey, mic device, language, modo de inserção.
   - HUD/overlay: status (listening, converting, error), preview opcional do texto.
   - Audio pipeline:
     - inicia ao receber “hotkeyDown”.
     - captura do mic (getUserMedia).
     - converte para PCM 16kHz mono.
     - envia frames ao main via IPC (buffer binário).
     - para ao “hotkeyUp”, envia “end-of-stream”.

3. **IPC Contracts (interfaces “públicas” internas)**
   - `stt:start` (payload: sampleRate, deviceId, language, sessionId)
   - `stt:audio` (payload: sessionId, pcmChunk: ArrayBuffer)
   - `stt:stop` (payload: sessionId)
   - `stt:partial` (payload: sessionId, text)
   - `stt:final` (payload: sessionId, text)
   - `stt:error` (payload: sessionId, code, message)
   - `inject:paste` (payload: text, mode)

## Plano detalhado (passo a passo)

### Fase 0 — Especificação e UX de estados (0.5 dia)
- Definir estados e transições:
  - Idle, Listening, Finalizing, Injecting, Error (MicDenied, NoNetwork, AzureAuth, RateLimited).
- Definir comportamento do atalho:
  - Press-and-hold inicia captura; soltar finaliza e injeta.
  - Se usuário apertar outro atalho “Cancel”, descarta sessão.
- Definir “o que é sucesso” do MVP:
  - Transcrever 20–60s com latência aceitável e colar em Notepad/Slack sem travar.

### Fase 1 — Scaffold do app (1 dia)
- Criar infraestrutura de Electron no repo atual (Vite + React + TS).
- Tray + Settings window + HUD simples.
- Config local + armazenamento seguro (keytar).
- Adicionar scripts padrão: `dev`, `build`, `lint`, `test`.

### Fase 2 — Hotkey + ciclo de sessão (0.5–1 dia)
- Implementar `globalShortcut`:
  - “down” => cria `sessionId`, manda evento para renderer iniciar áudio.
  - “up” => manda evento parar áudio, main manda “finalize”.
- Implementar `SessionManager`:
  - garante 1 sessão ativa; previne race (down repetido, up sem down).

### Fase 3 — Audio capture confiável (1–2 dias)
- Implementar getUserMedia + AudioWorklet.
- Implementar resampler 48k/44.1k -> 16k.
- Implementar framing (ex: 20ms) e backpressure (buffer limitado).
- Teste manual: gravar e validar que PCM não está “chipmunk/slow”.

### Fase 4 — Azure Speech streaming no main (1–2 dias)
- Criar `AzureSttClient` com streaming input.
- Emitir partial results para HUD (opcional) e final result ao terminar.
- Tratamento de erros (invalid key, region, network).
- Política: não persistir áudio; logs sem conteúdo sensível.

### Fase 5 — Injeção de texto (1–2 dias)
- Implementar “paste injection”:
  - salvar clipboard, setar texto, enviar Ctrl+V, restaurar clipboard.
- Escolher biblioteca/estratégia para enviar Ctrl+V:
  - preferência MVP: lib JS que simule input no Windows (avaliar confiabilidade/antivírus).
  - fallback sempre disponível: só copia + notifica.
- Edge cases:
  - sem janela focada: só copiar + toast.
  - colar em campos que bloqueiam paste: fallback para “digitação lenta” (fase posterior) ou só copiar.

### Fase 6 — UX mínima + configurações (1 dia)
- Settings:
  - Azure key/region (input + “test connection”).
  - hotkey (chord) configurável.
  - mic device selector.
  - toggle “mostrar preview enquanto fala”.
- HUD:
  - mostra listening + waveform simples (opcional).
  - mostra partial transcript (opcional) e status de colagem.

### Fase 7 — Qualidade / testes / verificação (0.5–1 dia)
- Unit tests (Vitest):
  - resampler (deterministico), chunk framing, state machine de sessão.
- Integration tests:
  - “audio fixture” (wav) passando pelo pipeline (sem mic real) e garantindo que o STT client recebe frames.
- Acceptance checklist (manual):
  - Notepad: ditar 30s e colar ok.
  - Slack/Discord: ditar 10s e colar ok.
  - Rede off: erro amigável.
  - Sem permissão mic: erro + instruções.

### Fase 8 — Empacotamento e distribuição (1–2 dias)
- `electron-builder` (ou forge) para gerar instalador Windows.
- Code signing (se necessário para reduzir warnings).

## Fase 2 (depois do MVP): tradução
- Adicionar modo “Translate on release”:
  - traduz transcript final para idioma alvo e injeta tradução.
- Provider: Azure Translator.
- UX: toggle per-app (perfis) ou toggle rápido no tray.

## Riscos e mitigações
- Injeção de texto instável: manter fallback “clipboard only” sempre.
- Latência alta do cloud: mostrar status; permitir “push-to-talk (sem partial)” como modo alternativo.
- Custos: limitar duração por sessão; opção de “stop automatic after N seconds”.
- Privacidade: nunca logar áudio; opcional desativar histórico; segredos no keytar.

## Assumptions (defaults)
- Hotkey default: `Ctrl+Win` (configurável, com fallback `Ctrl+Win+Space`).
- Linguagem STT default: `pt-BR` com opção de troca.
- Inserção default: clipboard + Ctrl+V; fallback para clipboard-only.
- Não armazenar áudio; histórico de texto desligado por default.

## Critérios de aceitação (MVP)
- Segurar hotkey inicia, soltar cola em app focado.
- Funciona em Windows 10/11.
- STT consistente para PT-BR em ambiente normal.
- Sem segredos em repo/logs; key/region armazenados via keytar.
