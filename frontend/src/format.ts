const MESES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

export function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split('-');
  return `${MESES[Number(mes) - 1]}/${ano}`;
}

export function formatarNumero(valor: number, casas = 0): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function formatarCompacto(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(valor);
}

export function formatarPercentual(valor: number): string {
  const sinal = valor > 0 ? '+' : '';
  return `${sinal}${(valor * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}
