import type { SerieMensal } from '../api/client';
import { formatarCompetencia, formatarMoeda, formatarNumero } from '../format';

interface Props {
  serie: SerieMensal[];
}

/**
 * "Quem piorou X%" é uma observação. "Ultrapassou o limite legal e pagou
 * R$ Y em compensação" é uma constatação com base na regulação do PRODIST.
 * Esse resumo mostra o mês mais recente com dado do dataset "Indicadores
 * Coletivos de Continuidade" da ANEEL — limite legal (acumulado no ano,
 * como o PRODIST apura de verdade) e compensação paga a consumidores por
 * violação de limites individuais de continuidade.
 */
export function ResumoRegulatorio({ serie }: Props) {
  const ultima = [...serie].reverse().find((s) => s.n_conjuntos_avaliados !== null);
  if (!ultima) return null;

  const acima = ultima.n_conjuntos_acima_limite_dec ?? 0;
  const total = ultima.n_conjuntos_avaliados ?? 0;
  const compensacao = ultima.compensacao_paga ?? 0;
  const mesReferencia = formatarCompetencia(ultima.competencia);

  return (
    <div className="resumo-regulatorio">
      <div className={acima > 0 ? 'regulatorio-item regulatorio-alerta' : 'regulatorio-item'}>
        <span className="regulatorio-valor">
          {formatarNumero(acima)} de {formatarNumero(total)}
        </span>
        <span className="regulatorio-rotulo">
          conjuntos acima do limite legal de DEC, acumulado até {mesReferencia}
        </span>
      </div>
      <div className={compensacao > 0 ? 'regulatorio-item regulatorio-alerta' : 'regulatorio-item'}>
        <span className="regulatorio-valor">{formatarMoeda(compensacao)}</span>
        <span className="regulatorio-rotulo">
          pagos em compensação a consumidores em {mesReferencia}
        </span>
      </div>
    </div>
  );
}
