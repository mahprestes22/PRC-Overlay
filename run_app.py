"""
WEC 2026 Broadcast Suite - Launcher Principal
Inicia a interface gráfica desktop (CustomTkinter) com servidores HTTP e WebSocket integrados.
"""
import os
import sys

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(base_dir, "backend")
    sys.path.insert(0, backend_dir)
    
    from gui import BroadcastControlApp
    app = BroadcastControlApp()
    app.mainloop()
