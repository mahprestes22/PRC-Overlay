# 🏁 Manual Completo do Sistema: LMU Race Control & Mesa do Narrador

Este documento detalha o funcionamento, arquitetura, telemetria e cada elemento visual da **Mesa de Transmissão e Race Control para o simulador Le Mans Ultimate (LMU)**. Ele foi elaborado para servir como guia definitivo para usuários, narradores, comentaristas e futuros desenvolvedores do projeto.

---

## 📌 1. Visão Geral e Propósito

O **LMU Race Control** é uma central de telemetria e controle de transmissão em tempo real desenvolvida sob medida para equipes de narração e produção de transmissões automobilísticas (YouTube, Twitch, TV).

### Principais Objetivos:
1. **Visão Tática Instantânea:** Permitir ao narrador saber em tempo real quem está liderando por classe, quem está no box, quem rodou ou sofreu danos, e o estado de energia/pneus de todos os carros.
2. **Direção de TV com 1 Clique:** Mudar instantaneamente a câmera do jogo para qualquer piloto com latência inferior a 7 milissegundos.
3. **Alertas Visuais Automáticos:** Destacar incidentes em amarelo pulsante e esmaecer carros que estão na garagem, evitando sobrecarga cognitiva na transmissão ao vivo.

---

## 🏗️ 2. Arquitetura do Sistema

O sistema opera através da fusão de três canais de comunicação com o simulador:

```
 ┌─────────────────────────────────────────────────────────────────┐
 │                   LE MANS ULTIMATE (JOGO)                       │
 └──────┬──────────────────────────┬────────────────────────┬──────┘
        │ Memória Compartilhada    │ Secret WebSocket       │ REST API (Swagger)
        │ (pyLMUSharedMemory)      │ (ws://127.0.0.1:6398)  │ (http://127.0.0.1:6397)
        ▼                          ▼                        ▲
 ┌──────────────────────────────────────────────────────────┴──────┐
 │                   BACKEND PYTHON (server.py)                    │
 │  - Processamento de telemetria e cálculo de classes             │
 │  - Rastreamento de tempo de pit stops e out laps                │
 │  - Detecção de danos, incidentes e bandeiras amarelas           │
 │  - Despachador assíncrono ultrarrápido de câmeras (~6ms)        │
 └──────────────────────────────┬──────────────────────────────────┘
                                │ WebSocket Público (ws://127.0.0.1:8989)
                                ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │               FRONTEND / INTERFACE (index.html)                 │
 │  - Reconciliação In-Place do DOM (Zero Flicker no Hover)        │
 │  - Tabela com rolagem suave para 36+ carros                     │
 │  - Dock fixo de câmeras e Painel Lateral do Piloto Focado       │
 └─────────────────────────────────────────────────────────────────┘
```

1. **Memória Compartilhada (`$LMU_SHARED_MEMORY_FILE`):**
   - Acesso em C++/ctypes de altíssima frequência (30Hz - 60Hz).
   - Fornece posições exatas, telemetria física, vetores de velocidade, desgaste dos 4 pneus, energia virtual, danos e bandeiras de setor.
2. **Secret WebSocket (`ws://127.0.0.1:6398/websocket/controlpanel`):**
   - Canal interno do jogo para extração dos nomes oficiais das equipes e números oficiais dos carros.
3. **REST API Swagger (`http://127.0.0.1:6397`):**
   - Controle direto de foco de espectadores e posicionamento de câmeras (`PUT /rest/watch/focus/{slot_id}` e `PUT /rest/watch/focus/{cameraType}/{group}/{advance}`).
4. **WebSocket Público (`ws://127.0.0.1:8989`):**
   - Transmissão compacta e formatada em JSON para as telas dos narradores e futuros overlays de OBS.

---

## 🖥️ 3. Guia Detalhado da Interface do Narrador

### 🏁 3.1. Barra Superior (Header & Status)
- **🏁 LMU Race Control:** Indicador do sistema.
- **Status do Servidor:** Badge `Conectado` (Verde) ou `Reconectando…` (Vermelho).
- **Nome da Pista:** Exibe o circuito oficial da sessão (ex: `AUTODROMO ENZO E DINO FERRARI`).
- **Sessão Atual:** Identifica a fase do evento: `TEST DAY`, `TREINO LIVRE 1 a 4`, `CLASSIFICAÇÃO`, `HYPERPOLE`, `WARMUP` ou `CORRIDA 1 a 4`.
- **Bandeira Geral da Pista:**
  - 🟢 **`BANDEIRA VERDE`**: Pista livre.
  - 🟡 **`SAFETY CAR / FCY`**: Full Course Yellow ou Safety Car ativo na sessão (badge amarelo pulsante).
  - 🔴 **`BANDEIRA VERMELHA`**: Sessão interrompida.
- **⏱️ Cronômetro:** Tempo restante regressivo oficial da sessão (`HH:MM:SS` ou `MM:SS`).
- **Setores (S1, S2, S3):** Três blocos que acendem em amarelo pulsante individualmente apenas se houver bandeira amarela local no respectivo setor.

---

### 📊 3.2. Tabela de Classificação em Tempo Real (Standings)

| Coluna | Descrição | Comportamento Visual |
| :--- | :--- | :--- |
| **CLASSE** | Categoria oficial WEC/LMU | 🔴 **`HY`** (Hypercar: Vermelho)<br>🔵 **`LMP2`** (Azul Royal)<br>🟢 **`LMGT3`** (Verde Esportivo)<br>🟡 **`LMGTE`** (Amarelo Queimado / Âmbar)<br>🟣 **`LMP3`** (Roxo) |
| **POS** | Posição geral na sessão | `P1` (Ouro), `P2` (Prata), `P3` (Bronze), `P4` em diante (Cinza). |
| **POS CLAS** | Posição dentro da respectiva classe | Calcula em tempo real quem é o líder, 2º e 3º colocado de cada categoria independente da posição geral. |
| **Nº** | Número oficial do carro | Destaque em azul ciano `#XX`. |
| **PILOTO / EQUIPE** | Nome do piloto e escuderia | Nome em destaque branco e equipe em fonte secundária. |
| **ÚLTIMA VOLTA** | Tempo da volta mais recente | Formato `M:SS.mmm`. |
| **MELHOR VOLTA** | Volta mais rápida do piloto | Formato `M:SS.mmm` em verde suave. |
| **AVG 5 LAPS** | Média de ritmo das últimas 5 voltas | Formato `M:SS.mmm` em ciano suave (calculado com voltas limpas sem pit). |
| **INT** | Intervalo para o carro imediatamente à frente | **Treino/Quali:** diferença de melhor volta. **Corrida:** gap em tempo real. Sempre visível em amarelo suave. |
| **GAP CLAS** | Gap para o líder da mesma classe | Visível **somente na corrida**. Exibe `LÍDER`, `+X.XXXs` ou `+NV` (voltas de atraso). Azul suave. |
| **ENERGIA / COMB.** | Energia Virtual ou Combustível | Valor numérico exato + barra visual colorida (Verde > 50%, Amarelo 25-50%, Vermelho < 25%). |
| **PNEUS** | Compostos nas 4 rodas | Letra única (**`S`** Branco, **`M`** Amarelo, **`H`** Vermelho, **`W`** Azul) se todos os pneus forem iguais. Se forem mistos, exibe um grid 2×2 com 4 bolinhas coloridas (FL, FR, RL, RR). |
| **DANO** | Porcentagem de avarias físicas | `0%` (Íntegro/Cinza), `1-15%` (Amarelo suave), `16-40%` (Laranja), `> 40%` (Vermelho pulsante `⚠️`). |
| **STATUS** | Estado do carro na pista/box | Badges inteligentes com regras dinâmicas (ver seção 3.3). |

---

### 🚦 3.3. Sistema Inteligente de Status dos Carros

O sistema classifica cada piloto em tempo real sob as seguintes regras:

1. **`🚪 GARAGE` (Na Garagem):**
   - Detecta quando o carro está recolhido na vaga da garagem do box (`mInGarageStall == True`).
   - **Comportamento Visual:** A **linha inteira do piloto fica esmaecida (meio apagada com transparência)**, permitindo focar a atenção nos carros que estão acelerando na pista.
2. **`⚠️ YELLOW` (Incidente / Carro Lento):**
   - Detecta se um carro na pista rodou, diminuiu bruscamente a velocidade (< 45 km/h) ou se recebeu bandeira amarela individual.
   - **Comportamento Visual:** A **linha inteira do piloto acende em amarelo vibrante pulsante com bordas destacadas**, alertando imediatamente a narração sobre quem causou ou está envolvido no acidente.
3. **`🔴 REQ` (Box Solicitado):**
   - O piloto apertou o botão no volante requisitando parada nos boxes (`mPitState == 1`).
4. **`⬇️ PIT IN` (Entrando no Pit):**
   - O carro cruzou a linha de entrada do pit e está no limite de velocidade deslocando-se em direção à sua vaga de box (`mInPits == True` e `mPitState == 2`).
5. **`🔧 PIT` (Executando Parada):**
   - O carro está parado na vaga do box efetuando a troca de pneus e reabastecimento (`mInPits == True` e `mPitState == 3`).
6. **`🚀 PIT OUT (XX.Xs)` (Saindo do Pit / Volta de Saída):**
   - O carro terminou o serviço no box e está acelerando pelo pit lane em direção à pista (`mPitState in (4, 5)`), e durante a volta de saída exibe a duração exata do pit stop (em segundos).
7. **`📡 ON AIR`:**
   - Indica quem é o piloto atualmente focado na câmera do jogo.
8. **`ON TRACK`:**
   - Piloto em volta limpa acelerando na pista.

---

### 📺 3.4. Painel Lateral do Piloto Focado (TV Focus Panel)

Ao clicar sobre qualquer piloto da tabela:
- O nome, número e classe do piloto são destacados.
- **Quatro Cards de Pneus (FL, FR, RL, RR):** Exibe o composto montado em cada roda (**`S`** Soft, **`M`** Medium, **`H`** Hard, **`W`** Wet) com destaque de cor oficial e nome por extenso.
- **Barra de Energia / Combustível:** Porcentagem exata com barra responsiva.
- **Barra de Integridade / Dano:** Monitora a saúde estrutural do veículo de 0% a 100%.
- **💥 Histórico Unificado de Incidentes & Replay Instantâneo:** Lista todos os toques daquele piloto na sessão com outros carros, muros e **bandeiras amarelas por setor (`S1`, `S2`, `S3`)**, com o botão `[▶ Replay]` que faz o jogo rebobinar automaticamente **4 segundos antes do ocorrido** para reproduzir o lance, além do botão `[🔴 AO VIVO]` para retornar à transmissão em tempo real.
- **🗺️ Radar de Pista 2D ao Vivo (Live Trackmap):** Desenha o traçado exato do circuito em SVG vetorial de alta definição e posiciona todos os carros em tempo real com as cores oficiais de cada classe e o número do carro. O piloto selecionado ganha um anel de pulso e destaque visual, permitindo ao narrador enxergar instantaneamente o tráfego à frente (retardatários / disputas de posição).

---

### 🎬 3.5. Dock Fixo de Controle de Câmeras

Fixado na parte inferior da tela, permite mudar a câmera do jogo instantaneamente:
- **`📺 TV Cam`:** Câmera de transmissão padrão da pista.
- **`🏎️ Cockpit`:** Câmera interna do piloto no volante.
- **`🎥 Capô / Bonnet`:** Câmera montada no bico/capô do carro.
- **`🎯 Nosecam`:** Câmera frontal baixa.
- **`📡 Trackside`:** Câmeras estáticas ao redor da pista.
- **`🎬 Chase`:** Câmera externa traseira de perseguição.
- **`🔄 Girar Câmera`:** Alterna entre as sub-câmeras onboard disponíveis no veículo.

---

## ⚡ 4. Otimizações de Desempenho Implementadas

1. **Zero Flicker no Mouse Hover (In-Place DOM Mutation):**
   - A tabela não recria nós DOM a cada frame. As linhas são persistentes e os dados sofrem mutação direta nas células, garantindo estabilidade visual absoluta a 30 FPS.
2. **Latência de Câmera Sub-7ms (Raw Async Sockets):**
   - Conexão assíncrona direta via `asyncio.open_connection('127.0.0.1', 6397)` sem sobrecarga de threads ou handshakes TCP síncronos.
3. **Event Delegation com `mousedown`:**
   - Captura do clique no milissegundo inicial do contato físico do mouse, sem esperar o ciclo de `mouseup`.

---

## 🚀 5. Como Executar a Aplicação

### Pré-requisitos:
- Windows 10/11.
- Python 3.10 ou superior instalado.
- Simulador **Le Mans Ultimate** aberto e com uma sessão em andamento.

### Passo a Passo:
1. Abra um terminal PowerShell na pasta do backend:
   ```powershell
   cd C:\Users\User\Documents\Projetos_2026\backend
   python server.py
   ```
2. **Mesa do Narrador (Race Control):** Abra no navegador:
   ```
   C:\Users\User\Documents\Projetos_2026\frontend\index.html
   ```
3. **Overlay para OBS Studio (Público da Transmissão):**
   - No OBS Studio, adicione uma nova fonte do tipo **Navegador (Browser Source)**.
   - Marque **Arquivo local** e aponte para:
     ```
     C:\Users\User\Documents\Projetos_2026\frontend\overlay\index.html
     ```
   - Largura: `1920` | Altura: `1080` | FPS: `60`.
   - **Modo de Edição / Posicionamento Livre:** Abra o arquivo `overlay/index.html` no Chrome segurando a tecla `Shift` (ou com a URL `?edit=true`) para arrastar e soltar os widgets na posição que desejar na tela. As coordenadas são salvas automaticamente no `settings.json`.

---

## 🎨 6. Master Broadcast Overlay (WEC Official Theme)

- **Único Canvas Master 1920x1080 transparente:** Carrega todos os widgets numa única fonte do OBS.
- **Automação Inteligente por Câmera:**
  - `TV Cam / Trackside:` Ativa a Torre Oficial Lateral WEC e o Lower-Third.
  - `Cockpit / Onboard:` Ativa os pedais e telemetria onboard.
- **Tipografia Oficial WEC:** `DrukWide-MediumItalic` para números e posições; `Archivo-BoldItalic` para pilotos e tempos.
- **Logos Oficiais das Montadoras:** Ferrari, Porsche, Toyota, Cadillac, BMW, Lamborghini, Corvette, Aston Martin, Ford, Peugeot, Alpine, McLaren.

---

## 📝 7. Mapa de Portas e Lembretes para Versões Futuras

| Serviço | Porta Padrão | Descrição |
| :--- | :--- | :--- |
| **Servidor WebSocket Público** | `8989` | Canal que alimenta o frontend e overlays de transmissão. |
| **REST API Oficial do LMU** | `6397` | API Swagger do jogo para controle de câmeras e tempos. |
| **Secret WebSocket do LMU** | `6398` | WebSocket interno do jogo para metadados de equipes e pilotos. |

> 📌 **Lembrete para o Módulo de GUI / Configurações:** Quando for desenvolvida a interface gráfica de configuração para o usuário final, adicionar campos de texto editáveis para alterar facilmente essas portas sem precisar mexer no código-fonte.
