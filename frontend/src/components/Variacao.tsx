import { formatarPercentual } from '../format';

interface Props {
  valor: number | null;
}

/** Indicador de "piorou/melhorou": seta + percentual, na cor divergente do tema. */
export function Variacao({ valor }: Props) {
  if (valor === null) {
    return <span className="texto-muted">sem histórico</span>;
  }
  const piorou = valor > 0;
  return (
    <span className="variacao" style={{ color: piorou ? 'var(--div-up)' : 'var(--div-down)' }}>
      {piorou ? '▲' : '▼'} {formatarPercentual(valor)}
    </span>
  );
}
