// Liga cada câmera de hardware (HARDWARE_CAMERAS) à zona (pdv_id) da API que a representa.
//
// ATENÇÃO: este mapa é PROVISÓRIO. A API não conhece "câmeras": ela mede por zona (pdv).
// Hoje a API tem 5 zonas: 1 Z1 Balcão Principal de Drinks, 2 Z2 Autosserviço Lateral,
// 3 Z3 Lounge e Mesas de Reunião, 4 Z5 Espaço Instagramável e 5 Bar Principal Norte.
// Não existe zona de entrada/catraca: as câmeras de entrada ficam sem zona (valores fictícios).
// A ligação das câmeras de F&B foi feita pelos nomes; confirme com o time (Luíza/Guilherme).
// Câmera sem zona (null) mostra os valores fictícios do hardware, com selo "Simulado".

export const CAMERA_PDV_MAP: Record<string, number | null> = {
  // Entradas: a API ainda não mede os acessos.
  'cam-ent-01': null,
  'cam-ent-02': null,
  'cam-ent-03': null,
  'cam-ent-04': null,
  // Câmeras de F&B.
  'cam-fb-01': 5, // Chopp Hub 1 (IPA & Pilsen) -> Bar Principal Norte
  'cam-fb-02': 1, // Estação Central Liquid -> Z1 Balcão Principal de Drinks
  'cam-fb-03': 2, // Chopp Hub 3 (Artesanais & Retirada) -> Z2 Autosserviço Lateral
};
