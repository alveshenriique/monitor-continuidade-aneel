import { useMemo, useState } from 'react';
import type { DistribuidoraRanking } from '../api/client';
import { formatarCompacto, formatarNumero } from '../format';
import { Variacao } from './Variacao';

interface Props {
  dados: DistribuidoraRanking[];
  selecionada: string | null;
  onSelecionar: (sig: string) => void;
}

type ColunaChave = 'distribuidora' | 'dec_ponderado' | 'variacao_pct' | 'n_interrupcoes' | 'consumidor_hora';
type Direcao = 'asc' | 'desc';

interface ColunaDef {
  chave: ColunaChave;
  rotulo: string;
  tipo: 'texto' | 'numero';
}

const COLUNAS: ColunaDef[] = [
  { chave: 'distribuidora', rotulo: 'Distribuidora', tipo: 'texto' },
  { chave: 'dec_ponderado', rotulo: 'DEC (h)', tipo: 'numero' },
  { chave: 'variacao_pct', rotulo: 'Variação', tipo: 'numero' },
  { chave: 'n_interrupcoes', rotulo: 'Interr.', tipo: 'numero' },
  { chave: 'consumidor_hora', rotulo: 'Cons.-hora', tipo: 'numero' },
];

export function RankingDistribuidoras({ dados, selecionada, onSelecionar }: Props) {
  // Padrão inicial: DEC decrescente — o mesmo jeito que a tabela já abre hoje.
  const [ordenacao, setOrdenacao] = useState<{ coluna: ColunaChave; direcao: Direcao }>({
    coluna: 'dec_ponderado',
    direcao: 'desc',
  });

  const dadosOrdenados = useMemo(() => {
    const { coluna, direcao } = ordenacao;
    const sinal = direcao === 'asc' ? 1 : -1;

    if (coluna === 'distribuidora') {
      return [...dados].sort((a, b) => sinal * a.distribuidora.localeCompare(b.distribuidora, 'pt-BR'));
    }

    // Variação pode ser null (distribuidora sem competência anterior pra comparar)
    // — fica sempre no final, não entra na ordenação numérica.
    const comValor = dados.filter((d) => d[coluna] !== null);
    const semValor = dados.filter((d) => d[coluna] === null);
    comValor.sort((a, b) => sinal * ((a[coluna] as number) - (b[coluna] as number)));
    return [...comValor, ...semValor];
  }, [dados, ordenacao]);

  function alternarOrdenacao(coluna: ColunaChave, tipo: ColunaDef['tipo']) {
    setOrdenacao((atual) => {
      if (atual.coluna === coluna) {
        return { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' };
      }
      // Texto começa A→Z; número começa do maior — cada um no sentido que
      // faz mais sentido ver primeiro.
      return { coluna, direcao: tipo === 'texto' ? 'asc' : 'desc' };
    });
  }

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
              {COLUNAS.map((col) => {
                const ativa = ordenacao.coluna === col.chave;
                const ariaSort = !ativa ? 'none' : ordenacao.direcao === 'asc' ? 'ascending' : 'descending';
                return (
                  <th key={col.chave} scope="col" aria-sort={ariaSort}>
                    <button
                      type="button"
                      className={ativa ? 'th-ordenavel th-ordenavel-ativa' : 'th-ordenavel'}
                      onClick={() => alternarOrdenacao(col.chave, col.tipo)}
                    >
                      {col.rotulo}
                      {ativa && (
                        <span className="seta-ordenacao" aria-hidden="true">
                          {ordenacao.direcao === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {dadosOrdenados.map((d) => {
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
