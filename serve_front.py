"""
Servidor HTTP leve para Single Page Application (SPA) do Front-end.
Puramente com a biblioteca padrão do Python, sem dependências externas.
Permite servir os artefatos compilados em dist/ com suporte a fallback de rotas SPA.
"""
from __future__ import annotations

import http.server
import os
import socketserver
import sys
from pathlib import Path


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    """Handler HTTP com suporte a SPA fallback (redireciona rotas inexistentes para index.html)."""

    def __init__(self, *args, directory: str | None = None, **kwargs):
        pasta = directory or os.environ.get("FRONTEND_DIR") or ("frontend/dist" if Path("frontend/dist").is_dir() else "dist")
        if not Path(pasta).is_dir() and Path("dist").is_dir():
            pasta = "dist"
        super().__init__(*args, directory=pasta, **kwargs)

    def do_GET(self) -> None:
        caminho_arquivo = self.translate_path(self.path)
        # Se o arquivo não existir fisicamente (e não for um asset com extensão), serve index.html
        if not os.path.exists(caminho_arquivo) and "." not in self.path.rsplit("/", 1)[-1]:
            self.path = "/index.html"
        super().do_GET()


def main() -> None:
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT_FRONTEND", "3000"))
    pasta = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("FRONTEND_DIR", "frontend/dist")
    
    # Permite reuso rápido de porta
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("0.0.0.0", porta), lambda *args, **kwargs: SPAHandler(*args, directory=pasta, **kwargs)) as httpd:
        print(f"[UI FRONT] Servindo na porta {porta} a partir de '{pasta}' -> http://localhost:{porta}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[UI FRONT] Servidor finalizado.")


if __name__ == "__main__":
    main()
