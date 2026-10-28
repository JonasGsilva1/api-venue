
export const LIMITE_ALERTA_OCUPACAO = 85;

type Rgb = readonly [number, number, number];

const PARADAS: ReadonlyArray<{ t: number; rgb: Rgb }> = [
  { t: 0, rgb: [37, 99, 235] },
  { t: 0.33, rgb: [16, 185, 129] },
  { t: 0.66, rgb: [250, 204, 21] },
  { t: 1, rgb: [239, 68, 68] },
];

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

function misturar(a: number, b: number, fator: number): number {
  return Math.round(a + (b - a) * fator);
}

export function intensidadeDeCalor(ocupacaoPct: number): number {
  return limitar(ocupacaoPct / LIMITE_ALERTA_OCUPACAO, 0, 1);
}
  
export function corDeCalor(intensidade: number): string {
  const t = limitar(intensidade, 0, 1);
  for (let i = 1; i < PARADAS.length; i++) {
    const anterior = PARADAS[i - 1];
    const proxima = PARADAS[i];
    if (t <= proxima.t) {
      const fator = (t - anterior.t) / (proxima.t - anterior.t);
      const [r, g, b] = anterior.rgb.map((c, k) => misturar(c, proxima.rgb[k], fator));
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  const [r, g, b] = PARADAS[PARADAS.length - 1].rgb;
  return `rgb(${r}, ${g}, ${b})`;
}

export const GRADIENTE_LEGENDA = `linear-gradient(to right, ${PARADAS.map(
  (p) => `${corDeCalor(p.t)} ${Math.round(p.t * 100)}%`,
).join(', ')})`;
