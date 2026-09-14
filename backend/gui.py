import os
import sys
import socket
import logging
import threading
import asyncio
import json
import webbrowser
import subprocess
import functools
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
import customtkinter as ctk
import tkinter as tk
from tkinter import messagebox, filedialog
import shutil

# Configurações de Apelo Visual do CustomTkinter
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

APP_TITLE = "WEC 2026 Broadcast Suite - Central de Controle"
APP_VERSION = "v2026.1 PRO"
DEFAULT_WS_PORT = 8989
DEFAULT_HTTP_PORT = 8080

def get_base_dir():
    """Retorna o diretório raiz do projeto."""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_local_ip():
    """Detecta automaticamente o endereço IPv4 local da máquina na rede."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


class AssetHTTPHandler(SimpleHTTPRequestHandler):
    """Servidor HTTP embutido para fornecer os arquivos do Overlay e Mesa ao OBS."""
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, format, *args):
        pass  # Silencia requests HTTP normais para não poluir o terminal


class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True


class TextboxLogHandler(logging.Handler):
    """Redireciona os logs do Python para o CTkTextbox da interface de forma thread-safe."""
    def __init__(self, textbox):
        super().__init__()
        self.textbox = textbox

    def emit(self, record):
        msg = self.format(record)
        def append():
            try:
                if self.textbox.winfo_exists():
                    self.textbox.configure(state="normal")
                    self.textbox.insert("end", msg + "\n")
                    self.textbox.see("end")
                    self.textbox.configure(state="disabled")
            except Exception:
                pass
        try:
            if self.textbox.winfo_exists():
                self.textbox.after(0, append)
        except Exception:
            pass


class BroadcastControlApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title(APP_TITLE)
        self.geometry("1040x720")
        self.minsize(920, 640)

        self.base_dir = get_base_dir()
        self.local_ip = get_local_ip()

        # Garante criação das pastas essenciais
        for folder in ["Media/logos", "Media/fotos", "Media/sponsors", "Media/backgrounds", "Media/icons", "logs"]:
            os.makedirs(os.path.join(self.base_dir, folder), exist_ok=True)

        # Mapeamento de Widgets para Posicionamento e Escala
        self.widget_options = {
            "🏰 Torre de Classificação": "wec-tower-container",
            "🏎️ Driver Onboard Telemetry": "driver-onboard-banner",
            "📊 Driver Stats (Voltas / Setores)": "driver-stats-banner",
            "🪪 Driver Box (Barra Inferior)": "wec-driver-box-container",
            "🗺️ Mapa da Pista": "wec-track-map-container",
            "⚠️ FCY / Safety Car Banner": "fcy-banner",
            "⏪ Banner de Replay": "replay-banner-container",
            "⚔️ Head to Head (1v1 Battle)": "wec-h2h-container",
            "⏱️ Qualify Tracker (Multi-Piloto)": "wec-qualify-tracker-container",
            "🏁 Starting Grid (Grade de Largada)": "wec-starting-grid-container",
            "⚡ Volta Mais Rápida (Fastest Lap)": "wec-fastest-lap-container"
        }

        # Posições padrão dos widgets (1920x1080)
        self.default_positions = {
            "wec-tower-container": {"x": 30, "y": 30},
            "driver-onboard-banner": {"x": 370, "y": 925},
            "driver-stats-banner": {"x": 370, "y": 925},
            "wec-driver-box-container": {"x": 370, "y": 930},
            "wec-track-map-container": {"x": 1560, "y": 30},
            "fcy-banner": {"x": 760, "y": 30},
            "replay-banner-container": {"x": 80, "y": 80},
            "wec-h2h-container": {"x": 370, "y": 800},
            "wec-qualify-tracker-container": {"x": 480, "y": 920},
            "wec-starting-grid-container": {"x": 80, "y": 240},
            "wec-fastest-lap-container": {"x": 1560, "y": 140}
        }

        # Carrega configurações salvas de positions e scales
        self.settings = self.load_settings()
        self.positions = self.settings.get("overlay_state", {}).get("positions", dict(self.default_positions))
        self.scales = self.settings.get("overlay_state", {}).get("scales", {})
        self.current_theme = self.settings.get("overlay_state", {}).get("overlayTheme", "WEC 2025")

        # Estado do Servidor
        self.server_thread = None
        self.server_engine = None
        self.server_loop = None
        self.http_server = None
        self.http_thread = None
        self.is_server_running = False

        self.setup_ui()
        self.setup_logging()

        # Inicia servidores automaticamente
        self.start_http_server()
        self.start_ws_server()

        # Monitor de heartbeat
        self.check_server_status_loop()

    def load_settings(self):
        settings_path = os.path.join(self.base_dir, "backend", "settings.json")
        if os.path.exists(settings_path):
            try:
                with open(settings_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return {"overlay_state": {}}

    def save_settings_to_disk(self):
        settings_path = os.path.join(self.base_dir, "backend", "settings.json")
        try:
            if "overlay_state" not in self.settings:
                self.settings["overlay_state"] = {}
            self.settings["overlay_state"]["positions"] = self.positions
            self.settings["overlay_state"]["scales"] = self.scales
            self.settings["overlay_state"]["overlayTheme"] = self.current_theme

            with open(settings_path, 'w', encoding='utf-8') as f:
                json.dump(self.settings, f, indent=4)
        except Exception as e:
            logging.error(f"Erro ao salvar settings.json: {e}")

    def broadcast_overlay_state(self, updates):
        """Envia alterações de estado do overlay via WebSocket do server.py de forma thread-safe."""
        self.save_settings_to_disk()
        if self.server_engine and hasattr(self.server_engine, "settings"):
            if "overlay_state" not in self.server_engine.settings:
                self.server_engine.settings["overlay_state"] = {}
            self.server_engine.settings["overlay_state"].update(updates)
            # Push imediato para todos os clientes conectados (sem precisar do jogo ativo)
            if hasattr(self.server_engine, "push_overlay_state"):
                self.server_engine.push_overlay_state()


    def setup_ui(self):
        # Layout Principal: Sidebar de Navegação + Conteúdo
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # -------------------------------------------------------------
        # 1. SIDEBAR (Navegação Esquerda)
        # -------------------------------------------------------------
        self.sidebar = ctk.CTkFrame(self, width=230, corner_radius=0, fg_color="#100d28")
        self.sidebar.grid(row=0, column=0, sticky="nsew")
        self.sidebar.grid_rowconfigure(8, weight=1)

        # Logo / Branding
        self.logo_label = ctk.CTkLabel(
            self.sidebar, text="🏎️ WEC 2026",
            font=ctk.CTkFont(size=22, weight="bold")
        )
        self.logo_label.grid(row=0, column=0, padx=20, pady=(20, 2), sticky="w")

        self.sub_logo = ctk.CTkLabel(
            self.sidebar, text="BROADCAST SUITE",
            font=ctk.CTkFont(size=11, weight="bold"), text_color="#00b33c"
        )
        self.sub_logo.grid(row=1, column=0, padx=20, pady=(0, 16), sticky="w")

        # Botões de Abas
        self.nav_buttons = {}
        tabs_info = [
            ("home", "🏠  Início & Status"),
            ("network", "🌐  Rede & OBS Studio"),
            ("themes", "🎨  Temas do Overlay"),
            ("layout", "📐  Ajuste de Widgets"),
            ("media", "🖼️  Mídias & Sponsors"),
            ("championship", "🏆  Campeonato"),
            ("logs", "📜  Console de Logs")
        ]

        for idx, (tab_key, label_text) in enumerate(tabs_info):
            btn = ctk.CTkButton(
                self.sidebar, text=label_text, anchor="w",
                font=ctk.CTkFont(size=13, weight="bold"),
                fg_color="transparent", hover_color="#1e1b4b",
                command=lambda k=tab_key: self.switch_tab(k)
            )
            btn.grid(row=idx + 2, column=0, padx=14, pady=4, sticky="ew")
            self.nav_buttons[tab_key] = btn

        # Rodapé da Sidebar com Status do Servidor
        self.status_box = ctk.CTkFrame(self.sidebar, fg_color="#161233", corner_radius=8)
        self.status_box.grid(row=9, column=0, padx=14, pady=16, sticky="ew")

        self.lbl_ws_status = ctk.CTkLabel(
            self.status_box, text="🟢 Servidor: ONLINE",
            font=ctk.CTkFont(size=12, weight="bold"), text_color="#22c55e"
        )
        self.lbl_ws_status.pack(padx=10, pady=(8, 2), anchor="w")

        self.lbl_http_status = ctk.CTkLabel(
            self.status_box, text=f"🌐 HTTP: :{DEFAULT_HTTP_PORT}",
            font=ctk.CTkFont(size=11), text_color="#94a3b8"
        )
        self.lbl_http_status.pack(padx=10, pady=(0, 8), anchor="w")

        # -------------------------------------------------------------
        # 2. CONTEÚDO PRINCIPAL (Área Direita)
        # -------------------------------------------------------------
        self.content_frame = ctk.CTkFrame(self, fg_color="#0a081a", corner_radius=0)
        self.content_frame.grid(row=0, column=1, sticky="nsew", padx=0, pady=0)
        self.content_frame.grid_rowconfigure(0, weight=1)
        self.content_frame.grid_columnconfigure(0, weight=1)

        # Telas
        self.frames = {}
        self.build_tab_home()
        self.build_tab_network()
        self.build_tab_themes()
        self.build_tab_layout()
        self.build_tab_media()
        self.build_tab_championship()
        self.build_tab_logs()

        self.switch_tab("home")

    def switch_tab(self, tab_name):
        """Alterna a tela visível e destaca o botão na sidebar."""
        for name, frame in self.frames.items():
            if name == tab_name:
                frame.grid(row=0, column=0, sticky="nsew", padx=24, pady=24)
            else:
                frame.grid_forget()

        for name, btn in self.nav_buttons.items():
            if name == tab_name:
                btn.configure(fg_color="#1e1b4b", text_color="#ffffff")
            else:
                btn.configure(fg_color="transparent", text_color="#94a3b8")

    # =========================================================================
    # ABA 1: INÍCIO & STATUS
    # =========================================================================
    def build_tab_home(self):
        frame = ctk.CTkScrollableFrame(self.content_frame, fg_color="transparent")
        self.frames["home"] = frame

        # Banner de Boas-Vindas
        hero = ctk.CTkFrame(frame, fg_color="#17123d", corner_radius=12)
        hero.pack(fill="x", pady=(0, 20))

        hero_title = ctk.CTkLabel(
            hero, text="Bem-vindo à Mesa de Transmissão WEC 2026",
            font=ctk.CTkFont(size=20, weight="bold"), text_color="#ffffff"
        )
        hero_title.pack(padx=20, pady=(18, 4), anchor="w")

        hero_desc = ctk.CTkLabel(
            hero,
            text="Central de controle de telemetria, corte de câmeras, replay instantâneo e overlay broadcast para Le Mans Ultimate.",
            font=ctk.CTkFont(size=13), text_color="#cbd5e1"
        )
        hero_desc.pack(padx=20, pady=(0, 18), anchor="w")

        # Cartão de Ações Rápidas
        actions_card = ctk.CTkFrame(frame, fg_color="#120e2e", corner_radius=12)
        actions_card.pack(fill="x", pady=(0, 16))

        card_title = ctk.CTkLabel(
            actions_card, text="⚡ Ações Rápidas",
            font=ctk.CTkFont(size=16, weight="bold"), text_color="#38bdf8"
        )
        card_title.pack(padx=20, pady=(16, 12), anchor="w")

        grid_actions = ctk.CTkFrame(actions_card, fg_color="transparent")
        grid_actions.pack(fill="x", padx=16, pady=(0, 16))
        grid_actions.grid_columnconfigure((0, 1), weight=1)

        # Botão: Abrir Mesa de Transmissão
        btn_open_mesa = ctk.CTkButton(
            grid_actions, text="🎛️  Abrir Mesa de Transmissão",
            height=46, font=ctk.CTkFont(size=14, weight="bold"),
            fg_color="#0284c7", hover_color="#0369a1",
            command=self.open_mesa_in_browser
        )
        btn_open_mesa.grid(row=0, column=0, padx=8, pady=8, sticky="ew")

        # Botão: Abrir Overlay no Navegador
        btn_open_overlay = ctk.CTkButton(
            grid_actions, text="📺  Abrir Master Overlay",
            height=46, font=ctk.CTkFont(size=14, weight="bold"),
            fg_color="#059669", hover_color="#047857",
            command=self.open_overlay_in_browser
        )
        btn_open_overlay.grid(row=0, column=1, padx=8, pady=8, sticky="ew")

        # Botão: Abrir Documentação
        btn_open_doc = ctk.CTkButton(
            grid_actions, text="📖  Manual & Documentação",
            height=40, font=ctk.CTkFont(size=13, weight="bold"),
            fg_color="#334155", hover_color="#475569",
            command=self.open_documentation
        )
        btn_open_doc.grid(row=1, column=0, padx=8, pady=8, sticky="ew")

        # Botão: Reiniciar Servidor
        self.btn_toggle_server = ctk.CTkButton(
            grid_actions, text="🔄  Sincronizar Serviços",
            height=40, font=ctk.CTkFont(size=13, weight="bold"),
            fg_color="#475569", hover_color="#64748b",
            command=self.restart_all_servers
        )
        self.btn_toggle_server.grid(row=1, column=1, padx=8, pady=8, sticky="ew")

        # Cartão de Informações do Sistema
        info_card = ctk.CTkFrame(frame, fg_color="#120e2e", corner_radius=12)
        info_card.pack(fill="x", pady=(0, 16))

        info_title = ctk.CTkLabel(
            info_card, text="📊 Informações de Conexão",
            font=ctk.CTkFont(size=16, weight="bold"), text_color="#a855f7"
        )
        info_title.pack(padx=20, pady=(16, 8), anchor="w")

        info_text = (
            f"• IP da Rede Local: {self.local_ip}\n"
            f"• Porta WebSocket (Telemetria): {DEFAULT_WS_PORT}\n"
            f"• Porta HTTP (Arquivos): {DEFAULT_HTTP_PORT}\n"
            f"• Conector do Jogo: Le Mans Ultimate InternalsPlugin (pyLMUSharedMemory)"
        )
        lbl_info = ctk.CTkLabel(
            info_card, text=info_text, justify="left",
            font=ctk.CTkFont(size=13), text_color="#cbd5e1"
        )
        lbl_info.pack(padx=20, pady=(0, 16), anchor="w")

    # =========================================================================
    # ABA 2: REDE & OBS STUDIO
    # =========================================================================
    def build_tab_network(self):
        frame = ctk.CTkScrollableFrame(self.content_frame, fg_color="transparent")
        self.frames["network"] = frame

        title = ctk.CTkLabel(
            frame, text="🌐 Links para o OBS Studio & Rede",
            font=ctk.CTkFont(size=20, weight="bold"), text_color="#ffffff"
        )
        title.pack(anchor="w", pady=(0, 8))

        desc = ctk.CTkLabel(
            frame,
            text="Copie as URLs abaixo e cole no OBS Studio como 'Fonte de Navegador' (Browser Source).",
            font=ctk.CTkFont(size=13), text_color="#94a3b8"
        )
        desc.pack(anchor="w", pady=(0, 20))

        # Seleção de Host (Localhost vs IP de Rede)
        host_frame = ctk.CTkFrame(frame, fg_color="#17123d", corner_radius=10)
        host_frame.pack(fill="x", pady=(0, 16), padx=2)

        lbl_select_host = ctk.CTkLabel(
            host_frame, text="Endereço de Origem:",
            font=ctk.CTkFont(size=13, weight="bold")
        )
        lbl_select_host.pack(side="left", padx=16, pady=12)

        self.host_mode_var = ctk.StringVar(value="localhost")
        rb_local = ctk.CTkRadioButton(
            host_frame, text=f"Localhost (Mesmo PC)",
            variable=self.host_mode_var, value="localhost",
            command=self.update_network_urls
        )
        rb_local.pack(side="left", padx=12, pady=12)

        rb_ip = ctk.CTkRadioButton(
            host_frame, text=f"IP da Rede ({self.local_ip}) - Para 2º PC / Transmissão Remota",
            variable=self.host_mode_var, value="ip",
            command=self.update_network_urls
        )
        rb_ip.pack(side="left", padx=12, pady=12)

        # 1. Card: Master Broadcast Overlay
        self.url_overlay_var = ctk.StringVar()
        self.create_link_card(
            frame,
            title="📺 Master Broadcast Overlay (WEC 2025/2026)",
            desc="Torre de classificação, Driver Onboard com telemetria e pop-out, Driver Box, Replay e FCY.\nResolução recomendada no OBS: 1920 x 1080 (FPS: 60)",
            url_var=self.url_overlay_var,
            card_color="#0284c7"
        )

        # 2. Card: Mesa de Transmissão / Mesa de Corte
        self.url_mesa_var = ctk.StringVar()
        self.create_link_card(
            frame,
            title="🎛️ Mesa de Transmissão & Controle",
            desc="Painel completo para o narrador/diretor de corte alternar câmeras, focar pilotos, ligar widgets e disparar replays.",
            url_var=self.url_mesa_var,
            card_color="#8b5cf6"
        )

        self.update_network_urls()

    def create_link_card(self, parent, title, desc, url_var, card_color):
        card = ctk.CTkFrame(parent, fg_color="#120e2e", corner_radius=12)
        card.pack(fill="x", pady=(0, 16))

        lbl_t = ctk.CTkLabel(card, text=title, font=ctk.CTkFont(size=15, weight="bold"), text_color=card_color)
        lbl_t.pack(padx=16, pady=(14, 4), anchor="w")

        lbl_d = ctk.CTkLabel(card, text=desc, justify="left", font=ctk.CTkFont(size=12), text_color="#cbd5e1")
        lbl_d.pack(padx=16, pady=(0, 10), anchor="w")

        row = ctk.CTkFrame(card, fg_color="transparent")
        row.pack(fill="x", padx=16, pady=(0, 14))

        entry = ctk.CTkEntry(row, textvariable=url_var, font=ctk.CTkFont(size=13), state="readonly")
        entry.pack(side="left", fill="x", expand=True, padx=(0, 10))

        btn_copy = ctk.CTkButton(
            row, text="📋 Copiar URL", width=120, height=36,
            font=ctk.CTkFont(size=13, weight="bold"),
            command=lambda: self.copy_to_clipboard(url_var.get())
        )
        btn_copy.pack(side="right")

    def update_network_urls(self):
        host = "127.0.0.1" if self.host_mode_var.get() == "localhost" else self.local_ip
        self.url_overlay_var.set(f"http://{host}:{DEFAULT_HTTP_PORT}/frontend/overlay/overlay.html")
        self.url_mesa_var.set(f"http://{host}:{DEFAULT_HTTP_PORT}/frontend/index.html")

    def copy_to_clipboard(self, text):
        self.clipboard_clear()
        self.clipboard_append(text)
        self.update()
        messagebox.showinfo("Copiado!", f"Link copiado para a Área de Transferência:\n\n{text}")

    # =========================================================================
    # ABA 3: TEMAS DO OVERLAY
    # =========================================================================
    def build_tab_themes(self):
        frame = ctk.CTkScrollableFrame(self.content_frame, fg_color="transparent")
        self.frames["themes"] = frame

        title = ctk.CTkLabel(
            frame, text="🎨 Seleção de Tema do Overlay",
            font=ctk.CTkFont(size=20, weight="bold"), text_color="#ffffff"
        )
        title.pack(anchor="w", pady=(0, 8))

        desc = ctk.CTkLabel(
            frame,
            text="Escolha a identidade visual da sua transmissão. O tema é atualizado instantaneamente no OBS e no navegador.",
            font=ctk.CTkFont(size=13), text_color="#94a3b8"
        )
        desc.pack(anchor="w", pady=(0, 20))

        themes = [
            ("WEC 2025", "🏆 FIA WEC 2025 / 2026 Official", "Design oficial da TV com azul marinho escuro, cabeçalhos de categoria, bandeiras em destaque e telemetria completa por montadora.", "#0284c7"),
            ("Sherminator Modern", "⚡ Sherminator Modern Dark", "Visual esportivo escuro de alta performance com tipografia bold e detalhes dinâmicos.", "#8b5cf6"),
            ("Classic Minimalist", "✨ Classic Minimalist", "Linhas limpas, tipografia fina e estética translúcida elegante para corridas clássicas.", "#10b981")
        ]

        self.theme_radio_var = ctk.StringVar(value=self.current_theme)

        for theme_key, theme_name, theme_desc, accent_color in themes:
            card = ctk.CTkFrame(frame, fg_color="#120e2e", corner_radius=12)
            card.pack(fill="x", pady=(0, 14))

            top_row = ctk.CTkFrame(card, fg_color="transparent")
            top_row.pack(fill="x", padx=16, pady=(14, 4))

            rb = ctk.CTkRadioButton(
                top_row, text=theme_name, value=theme_key,
                variable=self.theme_radio_var,
                font=ctk.CTkFont(size=15, weight="bold"),
                text_color=accent_color,
                command=lambda k=theme_key: self.apply_theme(k)
            )
            rb.pack(side="left")

            lbl_d = ctk.CTkLabel(card, text=theme_desc, justify="left", font=ctk.CTkFont(size=12), text_color="#cbd5e1")
            lbl_d.pack(padx=16, pady=(0, 14), anchor="w")

        btn_apply = ctk.CTkButton(
            frame, text="✨  Aplicar Tema Selecionado", height=44,
            font=ctk.CTkFont(size=14, weight="bold"),
            fg_color="#059669", hover_color="#047857",
            command=lambda: self.apply_theme(self.theme_radio_var.get())
        )
        btn_apply.pack(pady=10, anchor="w")

    def apply_theme(self, theme_name):
        self.current_theme = theme_name
        self.broadcast_overlay_state({"overlayTheme": theme_name})
        logging.info(f"Tema do Overlay alterado para: '{theme_name}'")
        messagebox.showinfo("Tema Aplicado", f"Tema alterado para '{theme_name}' com sucesso no Overlay!")

    # =========================================================================
    # ABA 4: AJUSTE DE POSIÇÃO & ESCALA DOS WIDGETS
    # =========================================================================
    def build_tab_layout(self):
        frame = ctk.CTkScrollableFrame(self.content_frame, fg_color="transparent")
        self.frames["layout"] = frame

        title = ctk.CTkLabel(
            frame, text="📐 Ajuste de Posição & Escala dos Widgets",
            font=ctk.CTkFont(size=20, weight="bold"), text_color="#ffffff"
        )
        title.pack(anchor="w", pady=(0, 8))

        desc = ctk.CTkLabel(
            frame,
            text="Selecione um widget e use o direcional de setas e a barra de escala para posicioná-lo com precisão de pixel no OBS.",
            font=ctk.CTkFont(size=13), text_color="#94a3b8"
        )
        desc.pack(anchor="w", pady=(0, 16))

        # Seletor de Widget
        selector_card = ctk.CTkFrame(frame, fg_color="#120e2e", corner_radius=12)
        selector_card.pack(fill="x", pady=(0, 16))

        sel_row = ctk.CTkFrame(selector_card, fg_color="transparent")
        sel_row.pack(fill="x", padx=16, pady=16)

        lbl_sel = ctk.CTkLabel(sel_row, text="Widget Alvo:", font=ctk.CTkFont(size=14, weight="bold"))
        lbl_sel.pack(side="left", padx=(0, 12))

        self.widget_select_var = ctk.StringVar(value=list(self.widget_options.keys())[0])
        self.combo_widgets = ctk.CTkComboBox(
            sel_row, values=list(self.widget_options.keys()),
            variable=self.widget_select_var, width=320, height=36,
            font=ctk.CTkFont(size=13), command=self.on_widget_selected
        )
        self.combo_widgets.pack(side="left")

        # Container Principal dos Controles (Grid Lado a Lado: Movimento | Escala)
        controls_grid = ctk.CTkFrame(frame, fg_color="transparent")
        controls_grid.pack(fill="x", pady=(0, 16))
        controls_grid.grid_columnconfigure((0, 1), weight=1)

        # 1. Painel Esquerdo: Direcional de Setas (D-Pad)
        dpad_card = ctk.CTkFrame(controls_grid, fg_color="#120e2e", corner_radius=12)
        dpad_card.grid(row=0, column=0, padx=(0, 8), sticky="nsew")

        lbl_dpad = ctk.CTkLabel(dpad_card, text="🎯 Posicionamento na Tela", font=ctk.CTkFont(size=15, weight="bold"), text_color="#38bdf8")
        lbl_dpad.pack(padx=16, pady=(14, 8), anchor="w")

        # Seletor de Passo (10px, 1px, 50px)
        step_row = ctk.CTkFrame(dpad_card, fg_color="transparent")
        step_row.pack(fill="x", padx=16, pady=(0, 12))

        lbl_step = ctk.CTkLabel(step_row, text="Passo:", font=ctk.CTkFont(size=12, weight="bold"))
        lbl_step.pack(side="left", padx=(0, 8))

        self.step_var = ctk.IntVar(value=10)
        rb_10 = ctk.CTkRadioButton(step_row, text="10 px", variable=self.step_var, value=10)
        rb_10.pack(side="left", padx=6)
        rb_1 = ctk.CTkRadioButton(step_row, text="1 px (Fino)", variable=self.step_var, value=1)
        rb_1.pack(side="left", padx=6)
        rb_50 = ctk.CTkRadioButton(step_row, text="50 px", variable=self.step_var, value=50)
        rb_50.pack(side="left", padx=6)

        # Matriz D-Pad 3x3
        dpad_matrix = ctk.CTkFrame(dpad_card, fg_color="transparent")
        dpad_matrix.pack(pady=(0, 14))

        btn_up = ctk.CTkButton(dpad_matrix, text="▲", width=64, height=54, font=ctk.CTkFont(size=20), command=lambda: self.move_widget(0, -self.step_var.get()))
        btn_up.grid(row=0, column=1, padx=4, pady=4)

        btn_left = ctk.CTkButton(dpad_matrix, text="◀", width=64, height=54, font=ctk.CTkFont(size=20), command=lambda: self.move_widget(-self.step_var.get(), 0))
        btn_left.grid(row=1, column=0, padx=4, pady=4)

        btn_reset_pos = ctk.CTkButton(dpad_matrix, text="⟲", width=64, height=54, font=ctk.CTkFont(size=16, weight="bold"), fg_color="#334155", hover_color="#475569", command=self.reset_current_widget_position)
        btn_reset_pos.grid(row=1, column=1, padx=4, pady=4)

        btn_right = ctk.CTkButton(dpad_matrix, text="▶", width=64, height=54, font=ctk.CTkFont(size=20), command=lambda: self.move_widget(self.step_var.get(), 0))
        btn_right.grid(row=1, column=2, padx=4, pady=4)

        btn_down = ctk.CTkButton(dpad_matrix, text="▼", width=64, height=54, font=ctk.CTkFont(size=20), command=lambda: self.move_widget(0, self.step_var.get()))
        btn_down.grid(row=2, column=1, padx=4, pady=4)

        self.lbl_current_coords = ctk.CTkLabel(dpad_card, text="Posição Atual: X = -- px | Y = -- px", font=ctk.CTkFont(size=13, weight="bold"), text_color="#38bdf8")
        self.lbl_current_coords.pack(pady=(0, 14))

        # 2. Painel Direito: Escala / Tamanho do Widget
        scale_card = ctk.CTkFrame(controls_grid, fg_color="#120e2e", corner_radius=12)
        scale_card.grid(row=0, column=1, padx=(8, 0), sticky="nsew")

        lbl_scale_title = ctk.CTkLabel(scale_card, text="🔍 Escala do Widget", font=ctk.CTkFont(size=15, weight="bold"), text_color="#a855f7")
        lbl_scale_title.pack(padx=16, pady=(14, 8), anchor="w")

        self.lbl_scale_val = ctk.CTkLabel(scale_card, text="Tamanho: 100% (1.0x)", font=ctk.CTkFont(size=14, weight="bold"), text_color="#ffffff")
        self.lbl_scale_val.pack(padx=16, pady=(8, 12), anchor="w")

        self.scale_slider = ctk.CTkSlider(scale_card, from_=0.5, to=2.0, number_of_steps=30, command=self.on_scale_slider_change)
        self.scale_slider.set(1.0)
        self.scale_slider.pack(fill="x", padx=16, pady=(0, 16))

        # Botões de Atalho de Escala
        quick_scale_frame = ctk.CTkFrame(scale_card, fg_color="transparent")
        quick_scale_frame.pack(fill="x", padx=16, pady=(0, 16))
        quick_scale_frame.grid_columnconfigure((0, 1, 2, 3), weight=1)

        scales_presets = [(0.75, "75%"), (1.0, "100%"), (1.25, "125%"), (1.5, "150%")]
        for idx, (s_val, s_lbl) in enumerate(scales_presets):
            btn_s = ctk.CTkButton(
                quick_scale_frame, text=s_lbl, height=32,
                font=ctk.CTkFont(size=11, weight="bold"),
                fg_color="#334155", hover_color="#475569",
                command=lambda v=s_val: self.set_widget_scale(v)
            )
            btn_s.grid(row=0, column=idx, padx=3, sticky="ew")

        btn_save_all = ctk.CTkButton(
            scale_card, text="💾  Salvar Todos os Ajustes", height=40,
            font=ctk.CTkFont(size=13, weight="bold"),
            fg_color="#059669", hover_color="#047857",
            command=self.save_layout_and_notify
        )
        btn_save_all.pack(padx=16, pady=(10, 16), fill="x")

        # 3. Card de Opções Extras do Widget Selecionado (ex: 60 FPS para o Radar 2D)
        self.widget_extra_options_card = ctk.CTkFrame(frame, fg_color="#120e2e", corner_radius=12)

        lbl_opt_title = ctk.CTkLabel(
            self.widget_extra_options_card, text="⚡ Opções Especiais do Radar 2D",
            font=ctk.CTkFont(size=15, weight="bold"), text_color="#38bdf8"
        )
        lbl_opt_title.pack(padx=16, pady=(14, 4), anchor="w")

        lbl_opt_desc = ctk.CTkLabel(
            self.widget_extra_options_card,
            text="Ativa a interpolação fluida a 60 FPS dos carros na tela, fazendo os pontos deslizarem suavemente pela pista sem impacto no desempenho do jogo.",
            font=ctk.CTkFont(size=12), text_color="#cbd5e1", justify="left"
        )
        lbl_opt_desc.pack(padx=16, pady=(0, 10), anchor="w")

        current_60fps = self.settings.get("overlay_state", {}).get("map60Fps", True)
        self.map_60fps_var = ctk.BooleanVar(value=current_60fps)
        self.switch_map_60fps = ctk.CTkSwitch(
            self.widget_extra_options_card,
            text="Movimentação Suave em 60 FPS (Interpolação de Pista)",
            variable=self.map_60fps_var,
            font=ctk.CTkFont(size=13, weight="bold"),
            command=self.on_toggle_map_60fps
        )
        self.switch_map_60fps.pack(padx=16, pady=(0, 14), anchor="w")

        # Atualiza labels para o widget inicial
        self.on_widget_selected(self.widget_select_var.get())

    def get_selected_widget_id(self):
        sel_name = self.widget_select_var.get()
        return self.widget_options.get(sel_name, "wec-tower-container")

    def on_widget_selected(self, choice):
        widget_id = self.get_selected_widget_id()
        pos = self.positions.get(widget_id, self.default_positions.get(widget_id, {"x": 30, "y": 30}))
        scale = self.scales.get(widget_id, 1.0)

        self.lbl_current_coords.configure(text=f"Posição Atual: X = {pos['x']} px | Y = {pos['y']} px")
        self.scale_slider.set(scale)
        self.lbl_scale_val.configure(text=f"Tamanho: {int(round(scale * 100))}% ({scale:.2f}x)")

        # Exibe card de opções extras apenas quando o Mapa da Pista estiver selecionado
        if widget_id == "wec-track-map-container":
            self.widget_extra_options_card.pack(fill="x", pady=(0, 16))
        else:
            self.widget_extra_options_card.pack_forget()

    def on_toggle_map_60fps(self):
        val = bool(self.map_60fps_var.get())
        if "overlay_state" not in self.settings:
            self.settings["overlay_state"] = {}
        self.settings["overlay_state"]["map60Fps"] = val
        self.broadcast_overlay_state({"map60Fps": val})
        self.save_settings_to_disk()
        logging.info(f"Radar 2D: Modo 60 FPS definido para {'ATIVADO' if val else 'DESATIVADO'}")

    def move_widget(self, delta_x, delta_y):
        widget_id = self.get_selected_widget_id()
        if widget_id not in self.positions:
            self.positions[widget_id] = dict(self.default_positions.get(widget_id, {"x": 30, "y": 30}))

        self.positions[widget_id]["x"] += delta_x
        self.positions[widget_id]["y"] += delta_y

        pos = self.positions[widget_id]
        self.lbl_current_coords.configure(text=f"Posição Atual: X = {pos['x']} px | Y = {pos['y']} px")
        self.broadcast_overlay_state({"positions": self.positions})

    def on_scale_slider_change(self, val):
        widget_id = self.get_selected_widget_id()
        scale_rounded = round(val, 2)
        self.scales[widget_id] = scale_rounded
        self.lbl_scale_val.configure(text=f"Tamanho: {int(round(scale_rounded * 100))}% ({scale_rounded:.2f}x)")
        self.broadcast_overlay_state({"scales": self.scales})

    def set_widget_scale(self, val):
        self.scale_slider.set(val)
        self.on_scale_slider_change(val)

    def reset_current_widget_position(self):
        widget_id = self.get_selected_widget_id()
        default_pos = self.default_positions.get(widget_id, {"x": 30, "y": 30})
        self.positions[widget_id] = dict(default_pos)
        self.scales[widget_id] = 1.0
        self.on_widget_selected(self.widget_select_var.get())
        self.broadcast_overlay_state({"positions": self.positions, "scales": self.scales})
        logging.info(f"Widget '{widget_id}' resetado para a posição e escala padrão.")

    def save_layout_and_notify(self):
        self.save_settings_to_disk()
        self.broadcast_overlay_state({"positions": self.positions, "scales": self.scales})
        messagebox.showinfo("Layout Salvo", "Todas as posições e escalas dos widgets foram salvas e sincronizadas!")

    # =========================================================================
    # ABA 5: MÍDIAS & SPONSORS
    # =========================================================================
    def build_tab_media(self):
        frame = ctk.CTkScrollableFrame(self.content_frame, fg_color="transparent")
        self.frames["media"] = frame

        title = ctk.CTkLabel(
            frame, text="🖼️ Pastas de Mídias, Logos & Pilotos",
            font=ctk.CTkFont(size=20, weight="bold"), text_color="#ffffff"
        )
        title.pack(anchor="w", pady=(0, 8))

        desc = ctk.CTkLabel(
            frame,
            text="Coloque seus arquivos PNG nas pastas correspondentes para personalização automática do overlay.",
            font=ctk.CTkFont(size=13), text_color="#94a3b8"
        )
        desc.pack(anchor="w", pady=(0, 20))

        media_items = [
            ("📸 Fotos dos Pilotos", "Media/fotos", "Fotos dos pilotos com fundo transparente (PNG) para o pop-out 3D do Driver Onboard e Driver Box."),
            ("🏎️ Logos das Montadoras", "Media/logos", "Escudos e logos de marcas como Ferrari, Porsche, Toyota, Aston Martin, etc."),
            ("🏷️ Logos de Patrocinadores (Sponsors)", "Media/sponsors", "Logos para a aba inferior '#dob-sponsor-slot' do banner de onboard e cabeçalhos."),
            ("🌄 Imagens de Fundo (Backgrounds)", "Media/backgrounds", "Fundos para transições de tela cheia e artes de transmissão."),
            ("🌐 Ícones & Redes Sociais (Icons)", "Media/icons", "Ícones e PNGs personalizados para o rodapé da Grade de Largada e artes de transmissão.")
        ]

        for item_title, rel_path, item_desc in media_items:
            card = ctk.CTkFrame(frame, fg_color="#120e2e", corner_radius=12)
            card.pack(fill="x", pady=(0, 14))

            lbl_t = ctk.CTkLabel(card, text=item_title, font=ctk.CTkFont(size=15, weight="bold"), text_color="#38bdf8")
            lbl_t.pack(padx=16, pady=(14, 4), anchor="w")

            lbl_d = ctk.CTkLabel(card, text=item_desc, justify="left", font=ctk.CTkFont(size=12), text_color="#cbd5e1")
            lbl_d.pack(padx=16, pady=(0, 10), anchor="w")

            full_path = os.path.join(self.base_dir, rel_path)
            btn_open = ctk.CTkButton(
                card, text=f"📂 Abrir Pasta ({rel_path})", height=36,
                font=ctk.CTkFont(size=13, weight="bold"),
                fg_color="#334155", hover_color="#475569",
                command=lambda p=full_path: self.open_folder_in_explorer(p)
            )
            btn_open.pack(padx=16, pady=(0, 14), anchor="w")

        # ── Seção Redes Sociais ──────────────────────────────────────────────
        social_card = ctk.CTkFrame(frame, fg_color="#120e2e", corner_radius=12)
        social_card.pack(fill="x", pady=(0, 14))

        lbl_social_title = ctk.CTkLabel(
            social_card, text="📱 Redes Sociais — Grade de Largada",
            font=ctk.CTkFont(size=15, weight="bold"), text_color="#38bdf8"
        )
        lbl_social_title.pack(padx=16, pady=(14, 4), anchor="w")

        lbl_social_desc = ctk.CTkLabel(
            social_card,
            text="Personalize o texto e os ícones exibidos no rodapé da Grade de Largada. Escolha um ícone oficial das redes ou selecione seu PNG customizado.",
            font=ctk.CTkFont(size=12), text_color="#cbd5e1", justify="left"
        )
        lbl_social_desc.pack(padx=16, pady=(0, 12), anchor="w")

        social_fields_frame = ctk.CTkFrame(social_card, fg_color="transparent")
        social_fields_frame.pack(fill="x", padx=16, pady=(0, 10))
        social_fields_frame.grid_columnconfigure((0, 1, 2), weight=1)

        ICON_OPTIONS = [
            "Instagram", "YouTube", "X / Twitter", "Twitch",
            "Discord", "TikTok", "Facebook", "Website",
            "Custom (PNG)", "Nenhum"
        ]

        KEY_TO_OPTION = {
            "instagram": "Instagram", "youtube": "YouTube", "x": "X / Twitter", "twitter": "X / Twitter",
            "twitch": "Twitch", "discord": "Discord", "tiktok": "TikTok", "facebook": "Facebook",
            "website": "Website", "custom": "Custom (PNG)", "none": "Nenhum"
        }

        OPTION_TO_KEY = {
            "Instagram": "instagram", "YouTube": "youtube", "X / Twitter": "x",
            "Twitch": "twitch", "Discord": "discord", "TikTok": "tiktok", "Facebook": "facebook",
            "Website": "website", "Custom (PNG)": "custom", "Nenhum": "none"
        }

        social_entries = {}
        social_menus = {}
        social_custom_vars = {}
        social_custom_frames = {}
        social_file_labels = {}

        cols_cfg = [
            ("← Esquerda", "sgSocialLeft", "sgSocialLeftIcon", "sgSocialLeftCustom", "Instagram"),
            ("  Centro  ", "sgSocialCenter", "sgSocialCenterIcon", "sgSocialCenterCustom", "YouTube"),
            ("  Direita →", "sgSocialRight", "sgSocialRightIcon", "sgSocialRightCustom", "Website")
        ]

        overlay_state = self.settings.get("overlay_state", {})

        for col, (lbl_txt, text_key, icon_key, custom_key, default_icon) in enumerate(cols_cfg):
            col_frame = ctk.CTkFrame(social_fields_frame, fg_color="#18133d", corner_radius=8)
            col_frame.grid(row=0, column=col, padx=6, sticky="nsew")

            ctk.CTkLabel(col_frame, text=lbl_txt, font=ctk.CTkFont(size=12, weight="bold"),
                         text_color="#38bdf8").pack(anchor="w", padx=12, pady=(10, 4))

            # Campo de Texto / Handle
            cur_text = overlay_state.get(text_key, "")
            text_var = ctk.StringVar(value=cur_text)
            entry = ctk.CTkEntry(col_frame, textvariable=text_var, placeholder_text="@ handle ou canal",
                                 height=36, font=ctk.CTkFont(size=12))
            entry.pack(fill="x", padx=12, pady=(0, 8))
            social_entries[text_key] = text_var

            # Seletor de Ícone
            ctk.CTkLabel(col_frame, text="Ícone:", font=ctk.CTkFont(size=11, weight="bold"),
                         text_color="#94a3b8").pack(anchor="w", padx=12, pady=(0, 2))

            saved_icon_raw = str(overlay_state.get(icon_key, "")).lower()
            current_option = KEY_TO_OPTION.get(saved_icon_raw, default_icon)
            icon_var = ctk.StringVar(value=current_option)
            social_menus[icon_key] = icon_var

            # Custom PNG sub-frame
            cur_custom = overlay_state.get(custom_key, "")
            custom_var = ctk.StringVar(value=cur_custom)
            social_custom_vars[custom_key] = custom_var

            custom_frame = ctk.CTkFrame(col_frame, fg_color="transparent")
            social_custom_frames[custom_key] = custom_frame

            disp_filename = os.path.basename(cur_custom) if cur_custom else "Nenhum arquivo"
            lbl_file = ctk.CTkLabel(
                custom_frame, text=f"📄 {disp_filename}",
                font=ctk.CTkFont(size=11), text_color="#38bdf8" if cur_custom else "#64748b"
            )
            social_file_labels[custom_key] = lbl_file

            def _choose_custom_png(c_var=custom_var, lbl_f=lbl_file):
                fpath = filedialog.askopenfilename(
                    title="Selecione o Ícone PNG",
                    filetypes=[("Imagens PNG", "*.png"), ("Todas as Imagens", "*.png;*.jpg;*.jpeg;*.webp;*.svg")]
                )
                if fpath:
                    icons_dir = os.path.join(self.base_dir, "Media", "icons")
                    os.makedirs(icons_dir, exist_ok=True)
                    fname = os.path.basename(fpath)
                    dest = os.path.join(icons_dir, fname)
                    try:
                        shutil.copy2(fpath, dest)
                        rel_path = f"Media/icons/{fname}"
                        c_var.set(rel_path)
                        lbl_f.configure(text=f"✔ {fname}", text_color="#38bdf8")
                    except Exception as err:
                        logging.error(f"Erro ao copiar ícone: {err}")

            btn_browse = ctk.CTkButton(
                custom_frame, text="📁 Escolher PNG...", height=28,
                font=ctk.CTkFont(size=11, weight="bold"),
                fg_color="#334155", hover_color="#475569",
                command=_choose_custom_png
            )
            btn_browse.pack(fill="x", pady=(2, 2))
            lbl_file.pack(anchor="w", pady=(0, 6))

            def _on_icon_selected(choice, c_frame=custom_frame):
                if choice == "Custom (PNG)":
                    c_frame.pack(fill="x", padx=12, pady=(0, 8))
                else:
                    c_frame.pack_forget()

            opt_menu = ctk.CTkOptionMenu(
                col_frame, values=ICON_OPTIONS, variable=icon_var,
                height=32, font=ctk.CTkFont(size=12),
                command=_on_icon_selected
            )
            opt_menu.pack(fill="x", padx=12, pady=(0, 8))

            if current_option == "Custom (PNG)":
                custom_frame.pack(fill="x", padx=12, pady=(0, 8))

        # Barra de Ação Inferior: Botão Salvar + Status
        action_bar = ctk.CTkFrame(social_card, fg_color="transparent")
        action_bar.pack(fill="x", padx=16, pady=(10, 16))

        lbl_save_status = ctk.CTkLabel(
            action_bar, text="", font=ctk.CTkFont(size=12, weight="bold"),
            text_color="#10b981"
        )

        def _save_social_settings():
            updates = {}
            for _, text_key, icon_key, custom_key, _ in cols_cfg:
                updates[text_key] = social_entries[text_key].get().strip()
                selected_opt = social_menus[icon_key].get()
                updates[icon_key] = OPTION_TO_KEY.get(selected_opt, "none")
                updates[custom_key] = social_custom_vars[custom_key].get().strip()

            if "overlay_state" not in self.settings:
                self.settings["overlay_state"] = {}
            self.settings["overlay_state"].update(updates)
            self.save_settings_to_disk()
            self.broadcast_overlay_state(updates)

            lbl_save_status.configure(text="✅ Redes sociais salvas e atualizadas no overlay!", text_color="#10b981")
            self.after(3500, lambda: lbl_save_status.configure(text=""))

        btn_save_social = ctk.CTkButton(
            action_bar, text="💾 Salvar Redes Sociais",
            font=ctk.CTkFont(size=13, weight="bold"),
            fg_color="#10b981", hover_color="#059669",
            height=38, width=190,
            command=_save_social_settings
        )
        btn_save_social.pack(side="left", padx=(0, 14))
        lbl_save_status.pack(side="left", fill="x")

    # =========================================================================
    # ABA 6: CONFIGURAÇÃO DO CAMPEONATO
    # =========================================================================
    def build_tab_championship(self):
        frame = ctk.CTkScrollableFrame(self.content_frame, fg_color="transparent")
        self.frames["championship"] = frame

        # Título da Aba
        title = ctk.CTkLabel(
            frame, text="🏆 Configuração do Campeonato & Temporada",
            font=ctk.CTkFont(size=20, weight="bold"), text_color="#ffffff"
        )
        title.pack(anchor="w", pady=(0, 6))

        desc = ctk.CTkLabel(
            frame,
            text="Personalize o nome do campeonato para os overlays (Grade de Largada), gerencie o calendário de etapas e defina as regras de pontuação.",
            font=ctk.CTkFont(size=13), text_color="#94a3b8"
        )
        desc.pack(anchor="w", pady=(0, 16))

        # Carrega dados do campeonato
        champ = self.settings.get("championship", {})
        if not champ:
            champ = {
                "name": "FIA WORLD ENDURANCE CHAMPIONSHIP",
                "season": "2026",
                "rounds": [],
                "points_system": {
                    "P1": 25, "P2": 18, "P3": 15, "P4": 12, "P5": 10,
                    "P6": 8, "P7": 6, "P8": 4, "P9": 2, "P10": 1,
                    "pole": 1, "fastest_lap": 0
                }
            }
            self.settings["championship"] = champ

        # -------------------------------------------------------------
        # CARD 1: DADOS GERAIS DO CAMPEONATO
        # -------------------------------------------------------------
        card_info = ctk.CTkFrame(frame, fg_color="#120e2e", corner_radius=12)
        card_info.pack(fill="x", pady=(0, 14))

        top_info_row = ctk.CTkFrame(card_info, fg_color="transparent")
        top_info_row.pack(fill="x", padx=16, pady=(14, 4))

        lbl_info_title = ctk.CTkLabel(top_info_row, text="🏷️ Identificação da Competição", font=ctk.CTkFont(size=15, weight="bold"), text_color="#38bdf8")
        lbl_info_title.pack(side="left")

        self.lbl_save_status = ctk.CTkLabel(top_info_row, text="", font=ctk.CTkFont(size=12, weight="bold"), text_color="#22c55e")
        self.lbl_save_status.pack(side="right")

        lbl_info_desc = ctk.CTkLabel(card_info, text="Este nome é exibido no topo da Grade de Largada e nos futuros widgets de transmissão.", font=ctk.CTkFont(size=12), text_color="#cbd5e1")
        lbl_info_desc.pack(padx=16, pady=(0, 10), anchor="w")

        info_fields = ctk.CTkFrame(card_info, fg_color="transparent")
        info_fields.pack(fill="x", padx=16, pady=(0, 14))
        info_fields.grid_columnconfigure(0, weight=4)
        info_fields.grid_columnconfigure(1, weight=1)

        f_name = ctk.CTkFrame(info_fields, fg_color="transparent")
        f_name.grid(row=0, column=0, padx=(0, 10), sticky="ew")
        ctk.CTkLabel(f_name, text="Nome Oficial do Campeonato / Liga:", font=ctk.CTkFont(size=12, weight="bold"), text_color="#94a3b8").pack(anchor="w", pady=(0, 4))
        self.entry_champ_name = ctk.CTkEntry(f_name, height=36, font=ctk.CTkFont(size=13, weight="bold"))
        self.entry_champ_name.insert(0, champ.get("name", "FIA WORLD ENDURANCE CHAMPIONSHIP"))
        self.entry_champ_name.pack(fill="x")

        f_season = ctk.CTkFrame(info_fields, fg_color="transparent")
        f_season.grid(row=0, column=1, sticky="ew")
        ctk.CTkLabel(f_season, text="Temporada / Ano:", font=ctk.CTkFont(size=12, weight="bold"), text_color="#94a3b8").pack(anchor="w", pady=(0, 4))
        self.entry_champ_season = ctk.CTkEntry(f_season, height=36, font=ctk.CTkFont(size=13))
        self.entry_champ_season.insert(0, str(champ.get("season", "2026")))
        self.entry_champ_season.pack(fill="x")

        btn_save_champ = ctk.CTkButton(
            card_info, text="💾 Salvar Configurações do Campeonato & Transmitir", height=38,
            font=ctk.CTkFont(size=13, weight="bold"),
            fg_color="#0284c7", hover_color="#0369a1",
            command=self.save_championship_settings
        )
        btn_save_champ.pack(padx=16, pady=(0, 14), anchor="e")

        # -------------------------------------------------------------
        # CARD 2: CALENDÁRIO DE ETAPAS
        # -------------------------------------------------------------
        card_rounds = ctk.CTkFrame(frame, fg_color="#120e2e", corner_radius=12)
        card_rounds.pack(fill="x", pady=(0, 14))

        lbl_r_title = ctk.CTkLabel(card_rounds, text="📅 Calendário de Etapas", font=ctk.CTkFont(size=15, weight="bold"), text_color="#38bdf8")
        lbl_r_title.pack(padx=16, pady=(14, 4), anchor="w")

        lbl_r_desc = ctk.CTkLabel(card_rounds, text="Adicione as corridas da temporada com suas datas e circuitos (usadas no calendário e classificação).", font=ctk.CTkFont(size=12), text_color="#cbd5e1")
        lbl_r_desc.pack(padx=16, pady=(0, 12), anchor="w")

        # Formulário para adicionar nova etapa
        form_add = ctk.CTkFrame(card_rounds, fg_color="#17123d", corner_radius=8)
        form_add.pack(fill="x", padx=16, pady=(0, 12))
        form_add.grid_columnconfigure(0, weight=1)
        form_add.grid_columnconfigure(1, weight=3)
        form_add.grid_columnconfigure(2, weight=3)
        form_add.grid_columnconfigure(3, weight=2)
        form_add.grid_columnconfigure(4, weight=1)

        ctk.CTkLabel(form_add, text="Round:", font=ctk.CTkFont(size=11, weight="bold"), text_color="#94a3b8").grid(row=0, column=0, padx=6, pady=(8, 2), sticky="w")
        self.entry_round_num = ctk.CTkEntry(form_add, height=32, placeholder_text="1", width=50)
        self.entry_round_num.grid(row=1, column=0, padx=6, pady=(0, 8), sticky="ew")

        ctk.CTkLabel(form_add, text="Nome da Etapa:", font=ctk.CTkFont(size=11, weight="bold"), text_color="#94a3b8").grid(row=0, column=1, padx=6, pady=(8, 2), sticky="w")
        self.entry_round_name = ctk.CTkEntry(form_add, height=32, placeholder_text="Ex: 6 Horas de São Paulo")
        self.entry_round_name.grid(row=1, column=1, padx=6, pady=(0, 8), sticky="ew")

        ctk.CTkLabel(form_add, text="Circuito / Pista:", font=ctk.CTkFont(size=11, weight="bold"), text_color="#94a3b8").grid(row=0, column=2, padx=6, pady=(8, 2), sticky="w")
        self.entry_round_circuit = ctk.CTkEntry(form_add, height=32, placeholder_text="Ex: Autódromo de Interlagos")
        self.entry_round_circuit.grid(row=1, column=2, padx=6, pady=(0, 8), sticky="ew")

        ctk.CTkLabel(form_add, text="Data:", font=ctk.CTkFont(size=11, weight="bold"), text_color="#94a3b8").grid(row=0, column=3, padx=6, pady=(8, 2), sticky="w")
        self.entry_round_date = ctk.CTkEntry(form_add, height=32, placeholder_text="Ex: 12/07/2026")
        self.entry_round_date.grid(row=1, column=3, padx=6, pady=(0, 8), sticky="ew")

        btn_add_round = ctk.CTkButton(
            form_add, text="➕ Adicionar", height=32,
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color="#16a34a", hover_color="#15803d",
            command=self.add_championship_round
        )
        btn_add_round.grid(row=1, column=4, padx=6, pady=(0, 8), sticky="ew")

        # Container da lista de etapas cadastradas
        self.rounds_list_frame = ctk.CTkFrame(card_rounds, fg_color="transparent")
        self.rounds_list_frame.pack(fill="x", padx=16, pady=(0, 14))
        self.refresh_rounds_list_ui()

        # -------------------------------------------------------------
        # CARD 3: SISTEMA DE PONTUAÇÃO
        # -------------------------------------------------------------
        card_points = ctk.CTkFrame(frame, fg_color="#120e2e", corner_radius=12)
        card_points.pack(fill="x", pady=(0, 14))

        lbl_p_title = ctk.CTkLabel(card_points, text="📊 Sistema de Pontuação da Corrida", font=ctk.CTkFont(size=15, weight="bold"), text_color="#38bdf8")
        lbl_p_title.pack(padx=16, pady=(14, 4), anchor="w")

        lbl_p_desc = ctk.CTkLabel(card_points, text="Defina a pontuação atribuída a cada colocação e pontos bônus adicionais.", font=ctk.CTkFont(size=12), text_color="#cbd5e1")
        lbl_p_desc.pack(padx=16, pady=(0, 10), anchor="w")

        presets_bar = ctk.CTkFrame(card_points, fg_color="transparent")
        presets_bar.pack(fill="x", padx=16, pady=(0, 10))

        btn_pre_wec = ctk.CTkButton(
            presets_bar, text="🏆 Preset WEC Oficial (25, 18, 15... + Pole)", height=28,
            font=ctk.CTkFont(size=11, weight="bold"),
            fg_color="#334155", hover_color="#475569",
            command=lambda: self.apply_points_preset("WEC")
        )
        btn_pre_wec.pack(side="left", padx=(0, 8))

        btn_pre_f1 = ctk.CTkButton(
            presets_bar, text="🏎️ Preset F1 Padrão (25, 18, 15... + Volta)", height=28,
            font=ctk.CTkFont(size=11, weight="bold"),
            fg_color="#334155", hover_color="#475569",
            command=lambda: self.apply_points_preset("F1")
        )
        btn_pre_f1.pack(side="left", padx=(0, 8))

        pts_grid = ctk.CTkFrame(card_points, fg_color="#17123d", corner_radius=8)
        pts_grid.pack(fill="x", padx=16, pady=(0, 14))

        for c in range(6):
            pts_grid.grid_columnconfigure(c, weight=1)

        self.points_entries = {}
        pts_sys = champ.get("points_system", {})

        pos_labels = [
            ("P1", "P1", 0, 0), ("P2", "P2", 0, 1), ("P3", "P3", 0, 2),
            ("P4", "P4", 0, 3), ("P5", "P5", 0, 4), ("P6", "P6", 0, 5),
            ("P7", "P7", 1, 0), ("P8", "P8", 1, 1), ("P9", "P9", 1, 2),
            ("P10", "P10", 1, 3), ("Pole Position", "pole", 1, 4), ("Melhor Volta", "fastest_lap", 1, 5)
        ]

        for display_lbl, key, r, c in pos_labels:
            cell = ctk.CTkFrame(pts_grid, fg_color="transparent")
            cell.grid(row=r, column=c, padx=6, pady=6, sticky="ew")

            lbl = ctk.CTkLabel(cell, text=display_lbl, font=ctk.CTkFont(size=11, weight="bold"), text_color="#38bdf8")
            lbl.pack(anchor="w")

            e = ctk.CTkEntry(cell, height=30, font=ctk.CTkFont(size=12, weight="bold"))
            val = pts_sys.get(key, 0)
            e.insert(0, str(val))
            e.pack(fill="x")
            self.points_entries[key] = e

    def refresh_rounds_list_ui(self):
        """Reconstrói a lista visual de etapas cadastradas."""
        for widget in self.rounds_list_frame.winfo_children():
            widget.destroy()

        rounds = self.settings.get("championship", {}).get("rounds", [])
        if not rounds:
            lbl_empty = ctk.CTkLabel(
                self.rounds_list_frame, text="Nenhuma etapa cadastrada ainda. Adicione uma etapa acima!",
                font=ctk.CTkFont(size=12, slant="italic"), text_color="#64748b"
            )
            lbl_empty.pack(pady=10)
            return

        for idx, r in enumerate(rounds):
            row_frame = ctk.CTkFrame(self.rounds_list_frame, fg_color="#181340" if idx % 2 == 0 else "#140f36", corner_radius=6)
            row_frame.pack(fill="x", pady=2)
            row_frame.grid_columnconfigure(0, weight=1)
            row_frame.grid_columnconfigure(1, weight=4)
            row_frame.grid_columnconfigure(2, weight=3)
            row_frame.grid_columnconfigure(3, weight=2)
            row_frame.grid_columnconfigure(4, weight=1)
            row_frame.grid_columnconfigure(5, weight=1)

            # Round
            r_num = r.get("round", idx + 1)
            ctk.CTkLabel(row_frame, text=f"R{r_num}", font=ctk.CTkFont(size=12, weight="bold"), text_color="#00b9ff").grid(row=0, column=0, padx=8, pady=8, sticky="w")

            # Nome
            ctk.CTkLabel(row_frame, text=r.get("name", ""), font=ctk.CTkFont(size=12, weight="bold"), text_color="#ffffff").grid(row=0, column=1, padx=8, pady=8, sticky="w")

            # Circuito
            ctk.CTkLabel(row_frame, text=r.get("circuit", ""), font=ctk.CTkFont(size=11), text_color="#94a3b8").grid(row=0, column=2, padx=8, pady=8, sticky="w")

            # Data
            ctk.CTkLabel(row_frame, text=r.get("date", ""), font=ctk.CTkFont(size=11), text_color="#cbd5e1").grid(row=0, column=3, padx=8, pady=8, sticky="w")

            # Checkbox Concluída
            is_comp = r.get("completed", False)
            cb_var = ctk.BooleanVar(value=is_comp)
            cb = ctk.CTkCheckBox(
                row_frame, text="Concluída", variable=cb_var,
                font=ctk.CTkFont(size=11),
                command=lambda i=idx, v=cb_var: self.toggle_round_completed(i, v.get())
            )
            cb.grid(row=0, column=4, padx=8, pady=8, sticky="e")

            # Botão Deletar
            btn_del = ctk.CTkButton(
                row_frame, text="🗑️", width=32, height=28,
                fg_color="#ef4444", hover_color="#dc2626",
                font=ctk.CTkFont(size=12),
                command=lambda i=idx: self.delete_championship_round(i)
            )
            btn_del.grid(row=0, column=5, padx=8, pady=8, sticky="e")

    def add_championship_round(self):
        """Adiciona uma nova etapa à lista do campeonato."""
        name = self.entry_round_name.get().strip()
        circuit = self.entry_round_circuit.get().strip()
        date = self.entry_round_date.get().strip()
        num_str = self.entry_round_num.get().strip()

        if not name:
            messagebox.showwarning("Aviso", "Informe o nome da etapa!")
            return

        champ = self.settings.setdefault("championship", {})
        rounds = champ.setdefault("rounds", [])

        try:
            round_num = int(num_str) if num_str else len(rounds) + 1
        except Exception:
            round_num = len(rounds) + 1

        rounds.append({
            "round": round_num,
            "name": name,
            "circuit": circuit or "Circuito Padrão",
            "date": date or "Data a Definir",
            "completed": False
        })

        # Limpa os campos
        self.entry_round_name.delete(0, "end")
        self.entry_round_circuit.delete(0, "end")
        self.entry_round_date.delete(0, "end")
        self.entry_round_num.delete(0, "end")
        self.entry_round_num.insert(0, str(len(rounds) + 1))

        self.save_championship_settings(notify=False)
        self.refresh_rounds_list_ui()

    def delete_championship_round(self, idx):
        """Remove uma etapa do campeonato."""
        rounds = self.settings.get("championship", {}).get("rounds", [])
        if 0 <= idx < len(rounds):
            rounds.pop(idx)
            self.save_championship_settings(notify=False)
            self.refresh_rounds_list_ui()

    def toggle_round_completed(self, idx, completed):
        """Marca uma etapa como concluída ou pendente."""
        rounds = self.settings.get("championship", {}).get("rounds", [])
        if 0 <= idx < len(rounds):
            rounds[idx]["completed"] = bool(completed)
            self.save_championship_settings(notify=False)

    def apply_points_preset(self, preset):
        """Aplica presets oficiais de pontuação."""
        presets = {
            "WEC": {"P1": 25, "P2": 18, "P3": 15, "P4": 12, "P5": 10, "P6": 8, "P7": 6, "P8": 4, "P9": 2, "P10": 1, "pole": 1, "fastest_lap": 0},
            "F1":  {"P1": 25, "P2": 18, "P3": 15, "P4": 12, "P5": 10, "P6": 8, "P7": 6, "P8": 4, "P9": 2, "P10": 1, "pole": 0, "fastest_lap": 1}
        }
        data = presets.get(preset, {})
        for k, entry in self.points_entries.items():
            entry.delete(0, "end")
            entry.insert(0, str(data.get(k, 0)))

    def save_championship_settings(self, notify=True):
        """Salva todas as configurações do campeonato no settings.json e transmite ao overlay."""
        champ_name = self.entry_champ_name.get().strip() or "FIA WORLD ENDURANCE CHAMPIONSHIP"
        champ_season = self.entry_champ_season.get().strip() or "2026"

        champ = self.settings.setdefault("championship", {})
        champ["name"] = champ_name
        champ["season"] = champ_season

        # Pontuação
        pts_sys = {}
        for k, entry in self.points_entries.items():
            try:
                pts_sys[k] = int(entry.get().strip())
            except Exception:
                pts_sys[k] = 0
        champ["points_system"] = pts_sys

        # Sincroniza com overlay_state
        if "overlay_state" not in self.settings:
            self.settings["overlay_state"] = {}
        self.settings["overlay_state"]["championshipName"] = champ_name

        self.save_settings_to_disk()
        self.broadcast_overlay_state({"championshipName": champ_name})

        if notify:
            if hasattr(self, 'lbl_save_status'):
                self.lbl_save_status.configure(text="✅ Configurações salvas e transmitidas!")
                self.after(3000, lambda: self.lbl_save_status.configure(text=""))
            messagebox.showinfo("Campeonato Atualizado", f"As configurações do campeonato foram salvas com sucesso!\n\nNome: {champ_name}\nTemporada: {champ_season}")


    # =========================================================================
    # ABA 6: CONSOLE DE LOGS
    # =========================================================================
    def build_tab_logs(self):
        frame = ctk.CTkFrame(self.content_frame, fg_color="transparent")
        self.frames["logs"] = frame
        frame.grid_rowconfigure(1, weight=1)
        frame.grid_columnconfigure(0, weight=1)

        # Topo com Ações
        top_bar = ctk.CTkFrame(frame, fg_color="transparent")
        top_bar.grid(row=0, column=0, sticky="ew", pady=(0, 12))

        title = ctk.CTkLabel(
            top_bar, text="📜 Console de Eventos & Telemetria",
            font=ctk.CTkFont(size=18, weight="bold"), text_color="#ffffff"
        )
        title.pack(side="left")

        btn_clear = ctk.CTkButton(
            top_bar, text="🗑️ Limpar Console", width=120, height=32,
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color="#334155", hover_color="#475569",
            command=self.clear_logs
        )
        btn_clear.pack(side="right", padx=(8, 0))

        btn_open_log_folder = ctk.CTkButton(
            top_bar, text="📂 Pasta de Logs", width=120, height=32,
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color="#334155", hover_color="#475569",
            command=lambda: self.open_folder_in_explorer(os.path.join(self.base_dir, "logs"))
        )
        btn_open_log_folder.pack(side="right")

        # Caixa de Texto Terminal
        self.log_textbox = ctk.CTkTextbox(
            frame, font=ctk.CTkFont(family="Consolas", size=12),
            fg_color="#080614", text_color="#a7f3d0", wrap="word"
        )
        self.log_textbox.grid(row=1, column=0, sticky="nsew")
        self.log_textbox.configure(state="disabled")

    def setup_logging(self):
        logger = logging.getLogger()
        handler = TextboxLogHandler(self.log_textbox)
        formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s', datefmt='%H:%M:%S')
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    def clear_logs(self):
        self.log_textbox.configure(state="normal")
        self.log_textbox.delete("1.0", "end")
        self.log_textbox.configure(state="disabled")

    # =========================================================================
    # CONTROLE DE SERVIDORES (HTTP E WEBSOCKET)
    # =========================================================================
    def start_http_server(self):
        """Inicia o servidor de arquivos estáticos local na porta 8080."""
        def run():
            try:
                handler = functools.partial(AssetHTTPHandler, directory=self.base_dir)
                self.http_server = ReusableHTTPServer(('0.0.0.0', DEFAULT_HTTP_PORT), handler)
                logging.info(f"Servidor HTTP de Mídias/Overlay iniciado em http://127.0.0.1:{DEFAULT_HTTP_PORT}")
                self.http_server.serve_forever()
            except Exception as e:
                logging.error(f"Erro ao iniciar Servidor HTTP: {e}")

        self.http_thread = threading.Thread(target=run, daemon=True)
        self.http_thread.start()

    def start_ws_server(self):
        """Inicia o servidor WebSocket e a engine de telemetria LMU em background."""
        def run():
            try:
                sys.path.insert(0, os.path.join(self.base_dir, "backend"))
                from server import LMUBackendEngine
                
                self.server_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(self.server_loop)

                self.server_engine = LMUBackendEngine()
                self.is_server_running = True
                self.server_loop.run_until_complete(self.server_engine.run())
            except Exception as e:
                logging.error(f"Erro na execução do Servidor WebSocket: {e}")
                self.is_server_running = False

        self.server_thread = threading.Thread(target=run, daemon=True)
        self.server_thread.start()

    def restart_all_servers(self):
        logging.info("Sincronizando serviços e recarregando configurações...")
        self.local_ip = get_local_ip()
        self.update_network_urls()
        self.save_settings_to_disk()
        messagebox.showinfo("Sincronizado", "Os serviços foram atualizados com sucesso!")

    def check_server_status_loop(self):
        """Atualiza periodicamente o status da barra lateral."""
        if self.is_server_running:
            self.lbl_ws_status.configure(text="🟢 Servidor: ONLINE", text_color="#22c55e")
        else:
            self.lbl_ws_status.configure(text="🟡 Servidor: INICIANDO...", text_color="#eab308")

        self.after(3000, self.check_server_status_loop)

    # =========================================================================
    # UTILITÁRIOS DE SISTEMA E ABERTURA DE LINKS
    # =========================================================================
    def open_mesa_in_browser(self):
        webbrowser.open(f"http://localhost:{DEFAULT_HTTP_PORT}/frontend/index.html")

    def open_overlay_in_browser(self):
        webbrowser.open(f"http://localhost:{DEFAULT_HTTP_PORT}/frontend/overlay/overlay.html")

    def open_documentation(self):
        doc_path = os.path.join(self.base_dir, "MANUAL_DO_SISTEMA.md")
        if os.path.exists(doc_path):
            os.startfile(doc_path)
        else:
            webbrowser.open("https://github.com")

    def open_folder_in_explorer(self, folder_path):
        os.makedirs(folder_path, exist_ok=True)
        os.startfile(folder_path)


if __name__ == "__main__":
    app = BroadcastControlApp()
    app.mainloop()
