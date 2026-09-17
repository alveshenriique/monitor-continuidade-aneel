import { useState } from 'react';
import type { SerieMensal } from '../api/client';
import { formatarCompetencia, formatarNumero } from '../format';

const LARGURA = 640;
const ALTURA = 220;
const PADDING = { top: 16, right: 24, bottom: 28, left: 40 };

interface Props {
  serie: SerieMensal[];
}

export function LineChartDec({ serie }: Props) {
  const [indiceAtivo, setIndiceAtivo] = useState<number | null>(null);

  if (serie.length === 0) return null;

  const larguraUtil = LARGURA - PADDING.left - PADDING.right;
  const alturaUtil = ALTURA - PADDING.top - PADDING.bottom;
  const maxDec = Math.max(...serie.map((s) => s.dec_ponderado)) * 1.15 || 1;

  const x = (i: number) =>
    PADDING.left + (serie.length === 1 ? larguraUtil / 2 : (i / (serie.length - 1)) * larguraUtil);
  const y = (valor: number) => PADDING.top + alturaUtil - (valor / maxDec) * alturaUtil;

  const pontos = serie.map((s, i) => [x(i), y(s.dec_ponderado)] as const);
  const linhaPath = pontos.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px},${py}`).join(' ');

  const gridY = [0, 0.25, 0.5, 0.75, 1];
  const ativo = indiceAtivo !== null ? serie[indiceAtivo] : null;

  return (
    <div className="grafico-linha-wrap">
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label="Série temporal do DEC ponderado por competência"
        onPointerLeave={() => setIndiceAtivo(null)}
      >
        {gridY.map((f) => (
          <line
            key={f}
            x1={PADDING.left}
            x2={LARGURA - PADDING.right}
            y1={PADDING.top + alturaUtil * (1 - f)}
            y2={PADDING.top + alturaUtil * (1 - f)}
            stroke="var(--gridline)"
            strokeWidth={1}
          />
        ))}

        <path d={linhaPath} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {pontos.map(([px, py], i) => (
          <g key={i}>
            <circle cx={px} cy={py} r={4} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />
            {/* alvo de hover maior que o marcador */}
            <rect
              x={px - larguraUtil / serie.length / 2}
              y={PADDING.top}
              width={larguraUtil / serie.length}
              height={alturaUtil}
              fill="transparent"
              onPointerEnter={() => setIndiceAtivo(i)}
              onFocus={() => setIndiceAtivo(i)}
              tabIndex={0}
            />
          </g>
        ))}

        {indiceAtivo !== null && (
          <line
            x1={x(indiceAtivo)}
            x2={x(indiceAtivo)}
            y1={PADDING.top}
            y2={PADDING.top + alturaUtil}
            stroke="var(--baseline)"
            strokeWidth={1}
          />
        )}

        {/* rótulo direto no último ponto */}
        <text
          x={pontos[pontos.length - 1][0]}
          y={pontos[pontos.length - 1][1] - 10}
          textAnchor="end"
          fontSize={12}
          fill="var(--text-primary)"
        >
          {formatarNumero(serie[serie.length - 1].dec_ponderado, 2)} h
        </text>

        {serie.map((s, i) => (
          <text
            key={s.competencia}
            x={x(i)}
            y={ALTURA - 8}
            textAnchor="middle"
            fontSize={11}
            fill="var(--text-muted)"
          >
            {formatarCompetencia(s.competencia).split('/')[0]}
          </text>
        ))}
      </svg>

      {ativo && (
        <div className="tooltip-fixo">
          <strong>{formatarCompetencia(ativo.competencia)}</strong>
          <div>
            <span className="tooltip-valor">{formatarNumero(ativo.dec_ponderado, 2)} h</span> DEC
          </div>
          <div className="texto-muted">{formatarNumero(ativo.n_interrupcoes)} interrupções</div>
        </div>
      )}
    </div>
  );
}
