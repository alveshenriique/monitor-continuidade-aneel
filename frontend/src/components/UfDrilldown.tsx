import { useEffect, useState } from 'react';
import { api, type UfDetalhe } from '../api/client';
import { formatarPercentual } from '../format';
import { Modal } from './Modal';

interface Props {
  uf: string;
  ufNome: string;
  competencia: string;
  participacaoNacional: number;
  onFechar: () => void;
}

export function UfDrilldown({ uf, ufNome, competencia, participacaoNacional, onFechar }: Props) {
  const [detalhe, setDetalhe] = useState<UfDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setDetalhe(null);
    setErro(null);
    api
      .distribuidorasPorUf(uf, competencia)
      .then((d) => {
        if (!cancelado) setDetalhe(d);
      })
      .catch((e: Error) => {
        if (!cancelado) setErro(e.message);
      });
    return () => {
      cancelado = true;
    };
  }, [uf, competencia]);

  return (
    <Modal onClose={onFechar} labelledBy="uf-titulo">
      <div className="cartao">
        <div className="cartao-cabecalho">
          <div>
            <h2 id="uf-titulo">{ufNome}</h2>
            <p className="subtitulo">
              Responde por {formatarPercentual(participacaoNacional).replace('+', '')} do
              consumidor-hora perdido no Brasil neste mês. Distribuidoras atuantes aqui, com a
              variação de cada uma em relação à própria média de meses anteriores neste estado.
            </p>
          </div>
          <button className="botao-fechar" onClick={onFechar} aria-label="Fechar detalhe">
            ✕
          </button>
        </div>

        {erro && <p className="erro">Não foi possível carregar: {erro}</p>}
        {!erro && !detalhe && <p className="texto-muted">Carregando…</p>}

        {detalhe && detalhe.distribuidoras.length === 0 && (
          <p className="texto-muted">Nenhuma interrupção registrada nesta UF no mês.</p>
        )}

        {detalhe && detalhe.distribuidoras.length > 0 && (
          <div className="tabela-scroll">
            <table className="tabela-ranking">
              <thead>
                <tr>
                  <th scope="col">Distribuidora</th>
                  <th scope="col">Participação no estado</th>
                  <th scope="col">Variação</th>
                </tr>
              </thead>
              <tbody>
                {detalhe.distribuidoras.map((d) => {
                  const piorou = (d.variacao_pct ?? 0) > 0;
                  return (
                    <tr key={d.sig_agente}>
                      <td title={d.distribuidora}>
                        <div className="nome-distribuidora">{d.distribuidora}</div>
                        <div className="sigla-distribuidora">{d.sig_agente}</div>
                      </td>
                      <td className="numero">{formatarPercentual(d.participacao).replace('+', '')}</td>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
