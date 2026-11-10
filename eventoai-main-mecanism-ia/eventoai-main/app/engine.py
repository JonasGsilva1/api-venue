"""
Motor de Regras de Gargalo e Alertas Assistidos (`VenueEngine`), 100% focado em câmeras e filas
(sem rastreio de insumos ou gastronomia, conforme Lei #5 do `PROJECT_CONTEXT.md`).
"""
import uuid
from datetime import datetime
from typing import List, Optional
from app.schemas import MetricSnapshot, Alert


class VenueEngine:
    def __init__(self) -> None:
        self.current_snapshot: Optional[MetricSnapshot] = None
        self.active_alerts: List[Alert] = []
        self.history_snapshots: List[MetricSnapshot] = []

    def process_snapshot(self, snapshot: MetricSnapshot) -> List[Alert]:
        """
        Recebe a telemetria óptica das câmeras do estande, guarda no histórico
        e avalia regras de gargalo/fila para gerar alertas assistidos.
        """
        self.current_snapshot = snapshot
        self.history_snapshots.append(snapshot)

        new_alerts: List[Alert] = []

        # Regra 1: Alerta Assistido por Fila / Espera no Acesso ao Estande (Cenário S08)
        if snapshot.fila_balcao >= 6 or snapshot.tempo_espera_balcao_min >= 3.5:
            if not any(a.tipo == "ESPERA_ACIMA_DO_ALVO" and not a.resolvido for a in self.active_alerts):
                alert = Alert(
                    id=str(uuid.uuid4())[:8],
                    timestamp=datetime.now(),
                    tipo="ESPERA_ACIMA_DO_ALVO",
                    mensagem=(
                        f"Fila de acesso com {snapshot.fila_balcao} pessoas. "
                        f"Tempo estimado de espera ({snapshot.tempo_espera_balcao_min:.1f} min) acima do alvo."
                    ),
                    nivel="CRITICO" if snapshot.tempo_espera_balcao_min >= 4.0 else "ATENCAO",
                    zona="Z1 | Acesso Estande Principal (CAM-FLUXO-02)",
                    resolvido=False,
                )
                new_alerts.append(alert)
                self.active_alerts.append(alert)

        # Regra 2: Alerta de Saturação Espacial no Estande (Densidade elevada)
        if snapshot.pessoas_presentes >= 35:
            if not any(a.tipo == "SATURACAO_DENSIDADE" and not a.resolvido for a in self.active_alerts):
                alert = Alert(
                    id=str(uuid.uuid4())[:8],
                    timestamp=datetime.now(),
                    tipo="SATURACAO_DENSIDADE",
                    mensagem=(
                        f"Concentração elevada no estande ({snapshot.pessoas_presentes} pessoas presentes). "
                        "Recomenda-se redirecionamento de fluxo."
                    ),
                    nivel="CRITICO",
                    zona="Z3 | Lounge & Circulação Central",
                    resolvido=False,
                )
                new_alerts.append(alert)
                self.active_alerts.append(alert)

        return new_alerts

    def resolve_alert(self, alert_id: str, acao_tomada: str) -> bool:
        """Registra a decisão tática humana e resolve o alerta."""
        for alert in self.active_alerts:
            if alert.id == alert_id and not alert.resolvido:
                alert.resolvido = True
                alert.acao_tomada = acao_tomada
                return True
        return False


engine = VenueEngine()
