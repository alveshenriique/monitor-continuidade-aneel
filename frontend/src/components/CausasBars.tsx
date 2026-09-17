import { useMemo } from 'react';
import type { CausaMensal } from '../api/client';
import { formatarCompacto } from '../format';

const TOP_N = 7;

interface Props {
  causas: CausaMensal[];
}

interface CausaAgregada {
  causa: string;
  consumidorHora: number;
  programada: boolean | null;
}

export function CausasBars({ causas }: Props) {
  const agregadas = useMemo(() => {
    const porCausa = new Map<string, CausaAgregada>();
    for (const c of causas) {
      const atual = porCausa.get(c.causa);
      if (atual) {
        atual.consumidorHora += c.consumidor_hora;
      } else {
        porCausa.set(c.causa, {
          causa: c.causa,
          consumidorHora: c.consumidor_hora,
          programada: c.is_programada,
        });
      }
    }
    const lista = [...porCausa.values()].sort((a, b) => b.consumidorHora - a.consumidorHora);

    if (lista.length <= TOP_N) return lista;
    const outras = lista.slice(TOP_N).reduce((soma, c) => soma + c.consumidorHora, 0);
    return [
      ...lista.slice(0, TOP_N),
      { causa: 'OUTRAS', consumidorHora: outras, programada: null },
    ];
  }, [causas]);

  const max = Math.max(...agregadas.map((c) => c.consumidorHora), 1);

  return (
    <div className="causas-lista">
      {agregadas.map((c) => (
        <div className="causa-linha" key={c.causa}>
          <div className="causa-rotulo">
            <span>{c.causa}</span>
            {c.programada !== null && (
              <span className="causa-tag">{c.programada ? 'programada' : 'não programada'}</span>
            )}
          </div>
          <div className="causa-barra-trilho">
            <div
              className="causa-barra"
              style={{ width: `${(c.consumidorHora / max) * 100}%` }}
            />
            <span className="causa-valor">{formatarCompacto(c.consumidorHora)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
