import { formatarCompetenciaLonga } from '../format';

interface Props {
  competencias: string[];
  selecionada: string;
  onSelecionar: (competencia: string) => void;
}

export function CompetenciaSelector({ competencias, selecionada, onSelecionar }: Props) {
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
          </option>
        ))}
      </select>
    </label>
  );
}
