/**
 * Quantas distribuidoras o ranking por UF (`/indicadores/mapa/:uf/distribuidoras`)
 * exibe no máximo, ordenadas por participação no estado. Qualquer
 * distribuidora com ao menos uma interrupção na UF entra no cálculo, mas
 * presenças residuais (ex.: uma distribuidora de outro estado que atende só
 * um município de divisa, com participação perto de zero) não são
 * "distribuidoras do estado" — é um teto de exibição, não de dado: estados
 * com menos de N distribuidoras mostram todas as que houver.
 */
export const TOP_N_RANKING_UF = 10;

/**
 * Consumidor-hora mínimo, na competência, pra uma distribuidora entrar no
 * ranking nacional "Quem piorou no mês" (ordenado por variação percentual do
 * DEC). Abaixo disso a variação vira ruído estatístico: distribuidoras de 1
 * conjunto com poucas interrupções saltam de uma base quase-zero e aparecem
 * com variações de centenas de % sem significado (ex.: uma com 660
 * consumidor-hora em 2026-06 aparecia com +268%). Valor escolhido olhando a
 * distribuição real de 2026-06: 50.000 cons-hora corta as 13 distribuidoras
 * menores (todas com 1-5 conjuntos) e não elimina nenhuma com histórico
 * relevante — a maior cortada tem 51.412 cons-hora. Ranking por UF (TOP_N_
 * RANKING_UF acima) é um teto de exibição diferente; isto aqui é um piso de
 * elegibilidade.
 */
export const MIN_CONSUMIDOR_HORA_RANKING = 50_000;
