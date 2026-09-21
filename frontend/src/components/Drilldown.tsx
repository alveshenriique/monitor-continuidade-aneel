import { api, type DistribuidoraDetalhe } from '../api/client';
import { useCarregamento } from '../hooks/useCarregamento';
import { formatarCompetencia } from '../format';
import { LineChartDec } from './LineChartDec';
import { CausasBars } from './CausasBars';
import { Modal } from './Modal';
import { CabecalhoModal } from './CabecalhoModal';
import { ResumoRegulatorio } from './ResumoRegulatorio';

interface Props {
  sig: string;
  nome: string;
  competencia: string;
  onFechar: () => void;
}

export function Drilldown({ sig, nome, competencia, onFechar }: Props) {
  const { dado: detalhe, erro } = useCarregamento<DistribuidoraDetalhe>(
    () => api.distribuidoraDetalhe(sig, competencia),
    [sig, competencia],
  );

  // "jan/2026" quando o mês selecionado já é janeiro (janeiro sozinho não
  // vira "jan–jan/2026"); "jan–jul/2026" nos demais casos.
  const mesFim = formatarCompetencia(competencia);
  const rotuloPeriodo = competencia.endsWith('-01') ? mesFim : `jan–${mesFim}`;

  return (
    <Modal onClose={onFechar} labelledBy="drilldown-titulo">
      <div className="cartao">
        <CabecalhoModal
          tituloId="drilldown-titulo"
          titulo={nome}
          subtitulo={sig}
          onFechar={onFechar}
        />

        {erro && <p className="erro">Não foi possível carregar: {erro}</p>}
        {!erro && !detalhe && <p className="texto-muted">Carregando…</p>}

        {detalhe && (
          <>
            <ResumoRegulatorio serie={detalhe.serie} />
            <div className="drilldown-grid">
              <div>
                <h3>DEC ponderado por mês ({rotuloPeriodo})</h3>
                <LineChartDec serie={detalhe.serie} />
              </div>
              <div>
                <h3>Causas das interrupções ({rotuloPeriodo})</h3>
                <CausasBars causas={detalhe.causas} />
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
