import { useMemo, useState } from 'react';
import type { MalhaGeoJson, MapaUf as MapaUfRow } from '../api/client';
import { criarProjecao, geometriaParaPath } from '../geo';
import { formatarCompacto, formatarNumero } from '../format';

// Referencia os tokens --seq-100..700 de index.css (em vez de hex fixo), para
// o mapa respeitar os passos validados de claro/escuro do tema automaticamente.
const RAMPA = [
  'var(--seq-100)', 'var(--seq-200)', 'var(--seq-300)', 'var(--seq-400)',
  'var(--seq-500)', 'var(--seq-600)', 'var(--seq-700)',
];
const LARGURA = 480;
const ALTURA = 480;

interface Props {
  malha: MalhaGeoJson;
  dados: MapaUfRow[];
  onSelecionar: (uf: MapaUfRow) => void;
}

interface DicaFerramenta {
  x: number;
  y: number;
  uf: MapaUfRow;
}

export function MapaUf({ malha, dados, onSelecionar }: Props) {
  const [dica, setDica] = useState<DicaFerramenta | null>(null);

  const porCodigo = useMemo(
    () => new Map(dados.map((d) => [d.uf_codigo, d])),
    [dados],
  );

  // Buckets por quantil: reparte os 27 estados em 7 faixas de tamanho igual,
  // para o mapa diferenciar bem mesmo com poucos estados concentrando o impacto.
  const passoPorCodigo = useMemo(() => {
    const ordenado = [...dados].sort((a, b) => a.consumidor_hora - b.consumidor_hora);
    const passo = new Map<string, number>();
    ordenado.forEach((d, i) => {
      const bucket = Math.min(
        RAMPA.length - 1,
        Math.floor((i / ordenado.length) * RAMPA.length),
      );
      passo.set(d.uf_codigo, bucket);
    });
    return passo;
  }, [dados]);

  const projetar = useMemo(() => criarProjecao(malha, LARGURA, ALTURA), [malha]);

  return (
    <div className="cartao">
      <h2>Onde está piorando</h2>
      <p className="subtitulo">
        Consumidor-hora perdido por UF no mês. Essa métrica soma, em cada interrupção,
        o número de consumidores afetados multiplicado pela duração. Quanto mais escura
        a cor, maior o impacto.
      </p>
      <div className="mapa-layout">
        <svg
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          role="img"
          aria-label="Mapa do Brasil colorido pelo impacto das interrupções por UF"
          className="mapa-svg"
        >
          {malha.features.map((feature) => {
            const codigo = feature.properties.codarea;
            const linha = porCodigo.get(codigo);
            const passo = passoPorCodigo.get(codigo);
            const cor = passo !== undefined ? RAMPA[passo] : 'var(--gridline)';
            return (
              <path
                key={codigo}
                d={geometriaParaPath(feature.geometry, projetar)}
                fill={cor}
                stroke="var(--surface-1)"
                strokeWidth={1}
                className="mapa-uf"
                tabIndex={linha ? 0 : undefined}
                role={linha ? 'button' : undefined}
                aria-label={linha ? `Ver distribuidoras em ${linha.uf_nome}` : undefined}
                onPointerMove={(e) => {
                  if (!linha) return;
                  setDica({ x: e.clientX, y: e.clientY, uf: linha });
                }}
                onFocus={(e) => {
                  if (!linha) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDica({ x: rect.x, y: rect.y, uf: linha });
                }}
                onPointerLeave={() => setDica(null)}
                onBlur={() => setDica(null)}
                onClick={() => linha && onSelecionar(linha)}
                onKeyDown={(e) => {
                  if (linha && (e.key === 'Enter' || e.key === ' ')) onSelecionar(linha);
                }}
              >
                {linha && <title>{linha.uf_nome}</title>}
              </path>
            );
          })}
        </svg>

        <div className="legenda-sequencial">
          <span className="legenda-rotulo">menos impacto</span>
          <div className="legenda-rampa">
            {RAMPA.map((cor) => (
              <span key={cor} style={{ background: cor }} />
            ))}
          </div>
          <span className="legenda-rotulo">mais impacto</span>
        </div>
      </div>

      {dica && (
        <div
          className="tooltip"
          style={{ left: dica.x + 12, top: dica.y + 12 }}
          role="tooltip"
        >
          <strong>{dica.uf.uf_nome}</strong>
          <div>
            <span className="tooltip-valor">{formatarCompacto(dica.uf.consumidor_hora)}</span>{' '}
            consumidor-hora
          </div>
          <div className="texto-muted">
            {formatarNumero(dica.uf.n_interrupcoes)} interrupções
          </div>
        </div>
      )}
    </div>
  );
}
