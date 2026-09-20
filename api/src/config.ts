/**
 * Último mês que os datasets regulatórios da ANEEL (apurado, limite,
 * compensação) têm como CONSOLIDADO. A ANEEL publica esses três recursos com
 * cadência própria, independente do dataset de interrupções — os meses mais
 * recentes costumam vir parciais (ex.: compensação de 2026-07 incompleta,
 * 2026-08 zerada) porque a apuração daquele mês ainda está em andamento na
 * origem, não porque não houve nada a reportar.
 *
 * Usado para: (1) o painel abrir por padrão neste mês, não no mais recente
 * disponível, e (2) marcar meses posteriores como "em consolidação" na UI,
 * em vez de deixar o usuário ler um R$ 0 como se fosse um fato.
 *
 * É um valor fixo, atualizado manualmente conforme a ANEEL consolida novos
 * meses — não é derivado automaticamente do dado (o pipeline não tem como
 * saber, só pela própria fonte, se um mês já fechou ou só ainda não chegou
 * tudo). Ver README, seção "Limitações conhecidas".
 */
export const MES_CONSOLIDADO = '2026-06';

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
