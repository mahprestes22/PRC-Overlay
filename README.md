# 🏁 PRC Overlay — LMU Race Control & Mesa do Narrador

<p align="center">
  <img src="https://img.shields.io/badge/Simulator-Le%20Mans%20Ultimate-E10600?style=for-the-badge&logo=speedtest&logoColor=white" alt="LMU">
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/WebSocket-Realtime-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="WebSocket">
  <img src="https://img.shields.io/badge/Latency-Sub--7ms-brightgreen?style=for-the-badge" alt="Latency">
</p>

O **PRC Overlay (Prestes Race Control)** é uma central de telemetria, controle de transmissão e gestão de corridas em tempo real desenvolvida para o simulador **Le Mans Ultimate (LMU)**. 

Projetada sob medida para narradores, comentaristas e diretores de TV no automobilismo virtual, a ferramenta oferece leitura tática instantânea da prova, automação de overlays para OBS Studio e controle direto de câmeras com latência inferior a 7 milissegundos.

---

## 🌟 Principais Recursos

- **⏱️ Telemetria Completa em Tempo Real:** Tabela de classificação com posições gerais e por classe (HY, LMP2, LMGT3), gaps dinâmicos, ritmo médio (AVG 5 Laps), uso de energia virtual/combustível e desgaste dos 4 pneus por composto.
- **🎬 Direção de Câmeras com 1 Clique:** Troca imediata da câmera do jogo via REST API assíncrona, focando no piloto selecionado instantaneamente.
- **⚠️ Detecção Automática de Incidentes:** Destaca pilotos envolvidos em acidentes, rodadas ou lentidão com aviso visual em amarelo pulsante.
- **🚪 Gestão Dinâmica da Pista & Garagem:** Linhas de pilotos recolhidos na garagem são suavemente esmaecidas para reduzir a poluição visual na transmissão.
- **💥 Replay Instantâneo de Touques:** Histórico unificado de acidentes com botão de replay de 1 clique que rebobina a transmissão do jogo automaticamente 4 segundos antes da batida.
- **🗺️ Live Trackmap 2D Vetorial:** Desenho em tempo real do circuito com os carros posicionados por cor de categoria e anel de pulso no piloto focado.
- **🎨 Master Broadcast Overlay (Estilo WEC):** Canvas transparente 1920x1080 com suporte a logos de montadoras, dados de telemetria onboard e modo de edição livre (*drag and drop*) para OBS Studio.

---

## 🏗️ Arquitetura e Fluxo de Dados

O backend em Python consolida três canais de comunicação com o simulador e distribui a telemetria processada para a interface do narrador e para o OBS.
