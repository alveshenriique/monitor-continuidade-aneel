import { useEffect, useState } from 'react';
import { api, type DistribuidoraDetalhe } from '../api/client';
import { LineChartDec } from './LineChartDec';
import { CausasBars } from './CausasBars';

interface Props {
  sig: string;
  nome: string;
  onFechar: () => void;
}

export function Drilldown({ sig, nome, onFechar }: Props) {
  const [detalhe, setDetalhe] = useState<DistribuidoraDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setDetalhe(null);
    setErro(null);
    api
      .distribuidoraDetalhe(sig)
      .then((d) => {
        if (!cancelado) setDetalhe(d);
      })
      .catch((e: Error) => {
        if (!cancelado) setErro(e.message);
      });
    return () => {
      cancelado = true;
    };
  }, [sig]);

  return (
    <div className="cartao">
      <div className="cartao-cabecalho">
        <div>
          <h2>{nome}</h2>
          <p className="subtitulo">{sig}</p>
        </div>
        <button className="botao-fechar" onClick={onFechar} aria-label="Fechar detalhe">
          ✕
        </button>
      </div>

      {erro && <p className="erro">Não foi possível carregar: {erro}</p>}
      {!erro && !detalhe && <p className="texto-muted">Carregando…</p>}

      {detalhe && (
        <div className="drilldown-grid">
          <div>
            <h3>DEC ponderado por mês</h3>
            <LineChartDec serie={detalhe.serie} />
          </div>
          <div>
            <h3>Causas (todo o histórico)</h3>
            <CausasBars causas={detalhe.causas} />
          </div>
        </div>
      )}
    </div>
  );
}
