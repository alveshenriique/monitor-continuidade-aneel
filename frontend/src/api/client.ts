const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface DistribuidoraRanking {
  sig_agente: string;
  distribuidora: string;
  n_conjuntos: number;
  n_interrupcoes: number;
  consumidor_hora: number;
  dec_ponderado: number;
  fec_ponderado: number;
  dec_medio_anterior: number | null;
  variacao_dec: number | null;
  variacao_pct: number | null;
}

export interface SerieMensal {
  competencia: string;
  dec_ponderado: number;
  fec_ponderado: number;
  n_interrupcoes: number;
  consumidor_hora: number;
  // Enriquecimento regulatório — null se o pipeline rodou sem ingest_continuidade.
  n_conjuntos_avaliados: number | null;
  n_conjuntos_acima_limite_dec: number | null;
  n_conjuntos_acima_limite_fec: number | null;
  compensacao_paga: number | null;
}

export interface CausaMensal {
  competencia: string;
  causa: string;
  is_programada: boolean | null;
  n_interrupcoes: number;
  afetados_total: number;
  consumidor_hora: number;
}

export interface DistribuidoraDetalhe {
  sig_agente: string;
  serie: SerieMensal[];
  causas: CausaMensal[];
}

export interface MapaUf {
  uf: string;
  uf_codigo: string;
  uf_nome: string;
  regiao: string;
  regiao_nome: string;
  n_interrupcoes: number;
  afetados_total: number;
  consumidor_hora: number;
}

export interface DistribuidoraUf {
  sig_agente: string;
  distribuidora: string;
  n_interrupcoes: number;
  afetados_total: number;
  consumidor_hora: number;
  participacao: number;
  variacao_pct: number | null;
}

export interface UfDetalhe {
  uf: string;
  uf_nome: string;
  competencia: string;
  distribuidoras: DistribuidoraUf[];
}

export interface MalhaGeoJson {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { codarea: string };
    geometry:
      | { type: 'Polygon'; coordinates: number[][][] }
      | { type: 'MultiPolygon'; coordinates: number[][][][] };
  }>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Erro ${res.status} em ${path}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  competencias: () => get<string[]>('/indicadores/competencias'),
  distribuidoras: (competencia: string) =>
    get<DistribuidoraRanking[]>(
      `/indicadores/distribuidoras?competencia=${competencia}`,
    ),
  distribuidoraDetalhe: (sig: string) =>
    get<DistribuidoraDetalhe>(
      `/indicadores/distribuidoras/${encodeURIComponent(sig)}`,
    ),
  mapa: (competencia: string) =>
    get<MapaUf[]>(`/indicadores/mapa?competencia=${competencia}`),
  malha: () => get<MalhaGeoJson>('/indicadores/mapa/malha'),
  distribuidorasPorUf: (uf: string, competencia: string) =>
    get<UfDetalhe>(`/indicadores/mapa/${uf}/distribuidoras?competencia=${competencia}`),
};
