import { api, type UfDetalhe } from '../api/client';
import { formatarPercentualSimples } from '../format';
import { useCarregamento } from '../hooks/useCarregamento';
import { Modal } from './Modal';
import { CabecalhoModal } from './CabecalhoModal';
import { Variacao } from './Variacao';

interface Props {
  uf: string;
  ufNome: string;
  competencia: string;
  participacaoNacional: number;
  onFechar: () => void;
}

export function UfDrilldown({ uf, ufNome, competencia, participacaoNacional, onFechar }: Props) {
  const { dado: detalhe, erro } = useCarregamento<UfDetalhe>(
    () => api.distribuidorasPorUf(uf, competencia),
    [uf, competencia],
  );

  return (
    <Modal onClose={onFechar} labelledBy="uf-titulo">
      <div className="cartao">
        <CabecalhoModal
          tituloId="uf-titulo"
          titulo={ufNome}
          onFechar={onFechar}
          subtitulo={
            <>
              Responde por {formatarPercentualSimples(participacaoNacional)} do consumidor-hora
              perdido no Brasil neste mês. As 10 maiores distribuidoras aqui por participação no
              estado, com a variação de cada uma em relação à própria média de meses anteriores.
            </>
          }
        />

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
                {detalhe.distribuidoras.map((d) => (
                  <tr key={d.sig_agente}>
                    <td title={d.distribuidora}>
                      <div className="nome-distribuidora">{d.distribuidora}</div>
                      <div className="sigla-distribuidora">{d.sig_agente}</div>
                    </td>
                    <td className="numero">{formatarPercentualSimples(d.participacao)}</td>
                    <td className="numero">
                      <Variacao valor={d.variacao_pct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
