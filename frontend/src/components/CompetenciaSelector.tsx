import { formatarCompetenciaLonga } from '../format';

interface Props {
  competencias: string[];
  selecionada: string;
  mesConsolidado: string;
  onSelecionar: (competencia: string) => void;
}

export function CompetenciaSelector({ competencias, selecionada, mesConsolidado, onSelecionar }: Props) {
  return (
    <label className="filtro-competencia">
      <span>Competência</span>
      <select
        value={selecionada}
        onChange={(e) => onSelecionar(e.target.value)}
      >
        {competencias.map((c) => (
          <option key={c} value={c}>
            {formatarCompetenciaLonga(c)}
            {mesConsolidado && c > mesConsolidado ? ' — em consolidação' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
