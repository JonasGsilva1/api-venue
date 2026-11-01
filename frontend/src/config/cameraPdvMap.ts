// Liga cada câmera de hardware (HARDWARE_CAMERAS) à zona (pdv_id) da API que a representa.
// A API possui o endpoint dedicado GET /api/v1/venue/cameras que retorna todas as 7 câmeras
// (4 de entrada/perímetro + 3 de F&B) já vinculadas às suas respectivas zonas e leituras de IA.

export const CAMERA_PDV_MAP: Record<string, number | null> = {
  // Câmeras de Entrada / Perímetro.
  'cam-ent-01': 101, // Entrada Portão A (Perímetro Norte) -> ENT-A
  'cam-ent-02': 102, // Entrada Catracas VIP -> ENT-VIP
  'cam-ent-03': 103, // Entrada Pista Principal -> ENT-GERAL
  'cam-ent-04': 104, // Entrada Perímetro Leste -> ENT-LESTE
  // Câmeras de F&B.
  'cam-fb-01': 5, // Chopp Hub 1 (IPA & Pilsen) -> Bar Principal Norte
  'cam-fb-02': 1, // Estação Central Liquid -> Z1 Balcão Principal de Drinks
  'cam-fb-03': 2, // Chopp Hub 3 (Artesanais & Retirada) -> Z2 Autosserviço Lateral
};
