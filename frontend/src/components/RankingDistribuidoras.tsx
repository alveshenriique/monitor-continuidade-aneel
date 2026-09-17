import type { DistribuidoraRanking } from '../api/client';
import { formatarCompacto, formatarNumero, formatarPercentual } from '../format';

interface Props {
  dados: DistribuidoraRanking[];
  selecionada: string | null;
  onSelecionar: (sig: string) => void;
}

export function RankingDistribuidoras({ dados, selecionada, onSelecionar }: Props) {
  return (
    <div className="cartao">
      <h2>Quem piorou no mês</h2>
      <p className="subtitulo">
        Variação do DEC ponderado (horas de interrupção por consumidor) em relação à
        média das competências anteriores. Ordenado do que mais piorou para o que mais
        melhorou.
      </p>
      <div className="tabela-scroll">
        <table className="tabela-ranking">
          <thead>
            <tr>
              <th scope="col">Distribuidora</th>
              <th scope="col">DEC no mês (h)</th>
              <th scope="col">Variação vs. média anterior</th>
              <th scope="col">Interrupções</th>
              <th scope="col">Consumidor-hora perdido</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((d) => {
              const piorou = (d.variacao_pct ?? 0) > 0;
              const selecionadaLinha = d.sig_agente === selecionada;
              return (
                <tr
                  key={d.sig_agente}
                  className={selecionadaLinha ? 'linha-selecionada' : undefined}
                  onClick={() => onSelecionar(d.sig_agente)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selecionadaLinha}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onSelecionar(d.sig_agente);
                  }}
                >
                  <td>
                    <div className="nome-distribuidora">{d.distribuidora}</div>
                    <div className="sigla-distribuidora">{d.sig_agente}</div>
                  </td>
                  <td className="numero">{formatarNumero(d.dec_ponderado, 2)}</td>
                  <td className="numero">
                    {d.variacao_pct === null ? (
                      <span className="texto-muted">sem histórico</span>
                    ) : (
                      <span
                        className="variacao"
                        style={{ color: piorou ? 'var(--div-up)' : 'var(--div-down)' }}
                      >
                        {piorou ? '▲' : '▼'} {formatarPercentual(d.variacao_pct)}
                      </span>
                    )}
                  </td>
                  <td className="numero">{formatarNumero(d.n_interrupcoes)}</td>
                  <td className="numero">{formatarCompacto(d.consumidor_hora)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
