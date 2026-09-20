import type { DistribuidoraRanking } from '../api/client';
import { formatarCompacto, formatarNumero } from '../format';
import { Variacao } from './Variacao';

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
        Ordenado pelo DEC ponderado, a média de horas de interrupção por consumidor, do
        pior para o melhor no mês. A variação em relação à média das competências
        anteriores aparece ao lado, como informação complementar.
      </p>
      <div className="tabela-scroll">
        <table className="tabela-ranking">
          <thead>
            <tr>
              <th scope="col">Distribuidora</th>
              <th scope="col">DEC (h)</th>
              <th scope="col">Variação</th>
              <th scope="col">Interr.</th>
              <th scope="col">Cons.-hora</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((d) => {
              const selecionadaLinha = d.sig_agente === selecionada;
              return (
                <tr
                  key={d.sig_agente}
                  className={selecionadaLinha ? 'linha-clicavel linha-selecionada' : 'linha-clicavel'}
                  onClick={() => onSelecionar(d.sig_agente)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selecionadaLinha}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onSelecionar(d.sig_agente);
                  }}
                >
                  <td title={d.distribuidora}>
                    <div className="nome-distribuidora">{d.distribuidora}</div>
                    <div className="sigla-distribuidora">{d.sig_agente}</div>
                  </td>
                  <td className="numero">{formatarNumero(d.dec_ponderado, 2)}</td>
                  <td className="numero">
                    <Variacao valor={d.variacao_pct} />
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
