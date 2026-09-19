import { api, type DistribuidoraDetalhe } from '../api/client';
import { useCarregamento } from '../hooks/useCarregamento';
import { LineChartDec } from './LineChartDec';
import { CausasBars } from './CausasBars';
import { Modal } from './Modal';
import { CabecalhoModal } from './CabecalhoModal';
import { ResumoRegulatorio } from './ResumoRegulatorio';

interface Props {
  sig: string;
  nome: string;
  onFechar: () => void;
}

export function Drilldown({ sig, nome, onFechar }: Props) {
  const { dado: detalhe, erro } = useCarregamento<DistribuidoraDetalhe>(
    () => api.distribuidoraDetalhe(sig),
    [sig],
  );

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
                <h3>DEC ponderado por mês</h3>
                <LineChartDec serie={detalhe.serie} />
              </div>
              <div>
                <h3>Causas em todo o histórico</h3>
                <CausasBars causas={detalhe.causas} />
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
