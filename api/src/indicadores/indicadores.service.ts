import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseService } from '../database/database.service';
import { TOP_N_RANKING_UF, MIN_CONSUMIDOR_HORA_RANKING } from '../config';

const REGEX_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

interface Uf {
  codigo: number;
  sigla: string;
  nome: string;
  regiao_sigla: string;
  regiao_nome: string;
}

interface DomiciliosUf {
  codigo: number;
  sigla: string;
  domicilios: number;
}

const REFERENCE_DIR = resolve(__dirname, '..', '..', '..', 'data', 'reference');

/** UF é derivada dos dois primeiros dígitos do código IBGE do município
 * (convenção do próprio IBGE: código do município = código da UF + sufixo). */
const ufs: Uf[] = JSON.parse(
  readFileSync(resolve(REFERENCE_DIR, 'ufs.json'), 'utf-8'),
);
const UF_POR_CODIGO = new Map(ufs.map((uf) => [uf.codigo, uf]));
const UF_POR_SIGLA = new Map(ufs.map((uf) => [uf.sigla.toUpperCase(), uf]));

/**
 * Domicílios particulares permanentes ocupados por UF — IBGE, Censo
 * Demográfico 2022, tabela 4712 (SIDRA). Denominador usado pra normalizar o
 * consumidor-hora do mapa por intensidade, não por tamanho do estado (ver
 * mapa() abaixo). É domicílio, não "unidade consumidora" no sentido da ANEEL
 * (que inclui ligação comercial/industrial) — é a aproximação mais limpa
 * disponível sem o problema de um conjunto cruzar mais de um município/UF.
 */
const domiciliosPorUf: DomiciliosUf[] = JSON.parse(
  readFileSync(resolve(REFERENCE_DIR, 'domicilios_uf.json'), 'utf-8'),
);
const DOMICILIOS_POR_CODIGO = new Map(
  domiciliosPorUf.map((d) => [d.codigo, d.domicilios]),
);

export interface DistribuidoraMesRow {
  sig_agente: string;
  distribuidora: string;
  n_conjuntos: number;
  n_interrupcoes: number;
  consumidor_hora: number;
  dec_ponderado: number;
  fec_ponderado: number;
  dec_medio_anterior: number | null;
  variacao_dec: number | null;
  variacao_pct: number | null;
}

export interface SerieRow {
  competencia: string;
  dec_ponderado: number;
  fec_ponderado: number;
  n_interrupcoes: number;
  consumidor_hora: number;
  // Enriquecimento regulatório (dataset "Indicadores Coletivos de
  // Continuidade" da ANEEL) — null quando o pipeline rodou sem
  // `ingest_continuidade`, pra não quebrar quem não baixou esse dataset.
  n_conjuntos_avaliados: number | null;
  n_conjuntos_acima_limite_dec: number | null;
  n_conjuntos_acima_limite_fec: number | null;
  compensacao_paga: number | null;
}

export interface CausaRow {
  competencia: string;
  causa: string;
  is_programada: boolean | null;
  n_interrupcoes: number;
  afetados_total: number;
  consumidor_hora: number;
}

interface MunicipioMesRow {
  uf_codigo: number;
  n_interrupcoes: number;
  afetados_total: number;
  consumidor_hora: number;
}

export interface DistribuidoraUfRow {
  sig_agente: string;
  distribuidora: string;
  n_interrupcoes: number;
  afetados_total: number;
  consumidor_hora: number;
  participacao: number;
  variacao_pct: number | null;
}

export interface CompetenciasResposta {
  competencias: string[];
  /** Ver api/src/config.ts — meses depois deste ainda podem estar parciais. */
  mes_consolidado: string;
}

@Injectable()
export class IndicadoresService {
  private readonly logger = new Logger(IndicadoresService.name);
  private regulatorioDisponivel: Promise<boolean> | null = null;
  private metadadosDisponivel: Promise<boolean> | null = null;

  constructor(private readonly db: DatabaseService) {}

  /**
   * O enriquecimento regulatório é opcional (depende de
   * `python -m pipeline.ingest_continuidade` ter rodado). Checa uma vez se a
   * tabela existe e reaproveita o resultado, em vez de arriscar uma query
   * falhar por tabela ausente a cada request.
   */
  private async temTabelaRegulatorio(): Promise<boolean> {
    if (!this.regulatorioDisponivel) {
      this.regulatorioDisponivel = this.db
        .query<{ existe: boolean }>(
          `SELECT count(*) > 0 AS existe FROM information_schema.tables
           WHERE table_name = 'regulatorio_distribuidora_mes'`,
        )
        .then((rows) => rows[0]?.existe ?? false);
    }
    return this.regulatorioDisponivel;
  }

  /** Mesmo padrão de temTabelaRegulatorio() — `metadados` só existe se o
   * pipeline rodou com o enriquecimento regulatório (é lá que o mês
   * consolidado é calculado; ver pipeline/transform.py). */
  private async temTabelaMetadados(): Promise<boolean> {
    if (!this.metadadosDisponivel) {
      this.metadadosDisponivel = this.db
        .query<{ existe: boolean }>(
          `SELECT count(*) > 0 AS existe FROM information_schema.tables
           WHERE table_name = 'metadados'`,
        )
        .then((rows) => rows[0]?.existe ?? false);
    }
    return this.metadadosDisponivel;
  }

  /**
   * Mês consolidado, derivado do dado pelo pipeline (ver
   * calcular_mes_consolidado em transform.py) e persistido na tabela
   * `metadados`. Fallback explícito se ela não existir (banco antigo, ou
   * pipeline rodado sem `ingest_continuidade`): usa o mês mais recente
   * disponível e loga um aviso — o painel ainda abre em algo válido, só
   * sem a garantia de que esse mês está de fato consolidado.
   */
  private async mesConsolidado(competenciasDisponiveis: string[]): Promise<string> {
    if (await this.temTabelaMetadados()) {
      const rows = await this.db.query<{ mes_consolidado: string }>(
        `SELECT mes_consolidado FROM metadados LIMIT 1`,
      );
      if (rows[0]?.mes_consolidado) {
        return rows[0].mes_consolidado;
      }
    }
    this.logger.warn(
      'Tabela "metadados" ausente (ou vazia) — usando o mês mais recente ' +
        'disponível como mês consolidado. Rode o pipeline com ' +
        '`python -m pipeline.ingest_continuidade` antes do transform para ' +
        'derivar o valor de verdade.',
    );
    return competenciasDisponiveis[0] ?? '';
  }

  private validarCompetencia(competencia: string | undefined): string {
    if (!competencia || !REGEX_COMPETENCIA.test(competencia)) {
      throw new BadRequestException(
        'Parâmetro "competencia" é obrigatório no formato YYYY-MM.',
      );
    }
    return competencia;
  }

  /**
   * Lista as competências (meses) disponíveis, da mais recente para a mais
   * antiga, junto com o último mês consolidado — é a partir dessa resposta
   * que o painel decide em qual mês abrir por padrão e quais marcar como
   * "em consolidação" no seletor.
   */
  async competencias(): Promise<CompetenciasResposta> {
    const rows = await this.db.query<{ competencia: string }>(
      `SELECT DISTINCT strftime(competencia, '%Y-%m') AS competencia
       FROM distribuidora_mes
       ORDER BY competencia DESC`,
    );
    const competencias = rows.map((r) => r.competencia);
    return {
      competencias,
      mes_consolidado: await this.mesConsolidado(competencias),
    };
  }

  /**
   * Ranking das distribuidoras no mês, com a variação do DEC ponderado em
   * relação à média das competências anteriores disponíveis — é essa variação
   * que aponta "quem piorou", e é o critério de ordenação (decrescente, NULLS
   * por último: distribuidora sem competência anterior pra comparar não tem
   * variação, mas continua na lista). Calculada em SQL para evitar N+1 e
   * manter a API como uma camada fina sobre o DuckDB.
   *
   * Só entram distribuidoras com consumidor_hora >= MIN_CONSUMIDOR_HORA_RANKING
   * na competência: abaixo disso a variação percentual é ruído de base
   * pequena (ver comentário da constante em config.ts), não sinal real de
   * piora. É um filtro de elegibilidade do ranking — não exclui nada do
   * banco, só não participa dessa ordenação por variação.
   */
  async distribuidoras(competencia: string | undefined) {
    const comp = this.validarCompetencia(competencia);
    return this.db.query<DistribuidoraMesRow>(
      `WITH atual AS (
         SELECT sig_agente, distribuidora, n_conjuntos, n_interrupcoes,
                consumidor_hora, dec_ponderado, fec_ponderado
         FROM distribuidora_mes
         WHERE strftime(competencia, '%Y-%m') = ?
           AND consumidor_hora >= ?
       ),
       anteriores AS (
         SELECT sig_agente, avg(dec_ponderado) AS dec_medio_anterior
         FROM distribuidora_mes
         WHERE strftime(competencia, '%Y-%m') < ?
         GROUP BY sig_agente
       )
       SELECT a.sig_agente, a.distribuidora, a.n_conjuntos, a.n_interrupcoes,
              a.consumidor_hora, a.dec_ponderado, a.fec_ponderado,
              p.dec_medio_anterior,
              a.dec_ponderado - p.dec_medio_anterior AS variacao_dec,
              CASE WHEN p.dec_medio_anterior > 0
                   THEN (a.dec_ponderado - p.dec_medio_anterior) / p.dec_medio_anterior
              END AS variacao_pct
       FROM atual a
       LEFT JOIN anteriores p USING (sig_agente)
       ORDER BY variacao_pct DESC NULLS LAST, a.consumidor_hora DESC, a.sig_agente`,
      [comp, MIN_CONSUMIDOR_HORA_RANKING, comp],
    );
  }

  /**
   * Série temporal do DEC/FEC e quebra por causa de uma distribuidora, de
   * janeiro até a competência selecionada — o mesmo recorte "jan-X" que o
   * mapa e o ranking já respeitam, pra o seletor valer pra tela inteira.
   */
  async distribuidoraDetalhe(sig: string, competencia: string | undefined) {
    const comp = this.validarCompetencia(competencia);
    const comRegulatorio = await this.temTabelaRegulatorio();
    const serie = await this.db.query<SerieRow>(
      comRegulatorio
        ? `SELECT strftime(d.competencia, '%Y-%m') AS competencia,
                  d.dec_ponderado, d.fec_ponderado, d.n_interrupcoes, d.consumidor_hora,
                  r.n_conjuntos AS n_conjuntos_avaliados,
                  r.n_conjuntos_acima_limite_dec, r.n_conjuntos_acima_limite_fec,
                  r.compensacao_paga
           FROM distribuidora_mes d
           LEFT JOIN regulatorio_distribuidora_mes r
                  ON d.sig_agente = r.sig_agente AND d.competencia = r.competencia
           WHERE d.sig_agente = ?
             AND strftime(d.competencia, '%Y') = substr(?, 1, 4)
             AND strftime(d.competencia, '%Y-%m') <= ?
           ORDER BY d.competencia`
        : `SELECT strftime(competencia, '%Y-%m') AS competencia,
                  dec_ponderado, fec_ponderado, n_interrupcoes, consumidor_hora,
                  NULL AS n_conjuntos_avaliados, NULL AS n_conjuntos_acima_limite_dec,
                  NULL AS n_conjuntos_acima_limite_fec, NULL AS compensacao_paga
           FROM distribuidora_mes
           WHERE sig_agente = ?
             AND strftime(competencia, '%Y') = substr(?, 1, 4)
             AND strftime(competencia, '%Y-%m') <= ?
           ORDER BY competencia`,
      [sig, comp, comp],
    );
    if (serie.length === 0) {
      throw new NotFoundException(`Distribuidora "${sig}" não encontrada.`);
    }

    const causas = await this.db.query<CausaRow>(
      `SELECT strftime(competencia, '%Y-%m') AS competencia,
              causa, is_programada, n_interrupcoes, afetados_total, consumidor_hora
       FROM causa_distribuidora_mes
       WHERE sig_agente = ?
         AND strftime(competencia, '%Y') = substr(?, 1, 4)
         AND strftime(competencia, '%Y-%m') <= ?
       ORDER BY competencia, consumidor_hora DESC`,
      [sig, comp, comp],
    );

    return { sig_agente: sig, serie, causas };
  }

  /**
   * Consumidor-hora perdido por UF no mês, para colorir o mapa. Granularidade
   * de UF (não município): mais leve para renderizar e suficiente para
   * responder "onde está piorando" em um painel nacional.
   *
   * consumidor_hora é o total absoluto (soma) — favorece estados grandes por
   * população, não por intensidade do problema (ex.: SP lidera por volume
   * mesmo com serviço relativamente bom). consumidor_hora_por_domicilio
   * divide esse total pelos domicílios do estado (ver DOMICILIOS_POR_CODIGO),
   * e é esse o valor usado pra colorir o mapa — o absoluto continua disponível
   * pra quem precisar dele (ex.: cálculo de participação nacional no front).
   */
  async mapa(competencia: string | undefined) {
    const comp = this.validarCompetencia(competencia);
    const rows = await this.db.query<MunicipioMesRow>(
      `SELECT municipio_ibge // 100000 AS uf_codigo, -- divisão inteira: "/" do DuckDB arredonda em vez de truncar
              sum(n_interrupcoes)  AS n_interrupcoes,
              sum(afetados_total)  AS afetados_total,
              sum(consumidor_hora) AS consumidor_hora
       FROM municipio_mes
       WHERE strftime(competencia, '%Y-%m') = ?
       GROUP BY 1
       HAVING uf_codigo BETWEEN 11 AND 53`,
      [comp],
    );

    return rows
      .map((r) => {
        const uf = UF_POR_CODIGO.get(r.uf_codigo);
        if (!uf) return null; // código sem UF válida (ruído residual do dado bruto)
        const domicilios = DOMICILIOS_POR_CODIGO.get(uf.codigo);
        // Defensivo: se a UF não tiver domicílios cadastrados (não deveria
        // acontecer — a tabela cobre as 27), não divide por null/0; expõe
        // null e deixa o front decidir como representar "sem normalização".
        const consumidorHoraPorDomicilio =
          domicilios ? r.consumidor_hora / domicilios : null;
        return {
          uf: uf.sigla,
          uf_codigo: String(uf.codigo), // casa com "codarea" do GeoJSON de malha_uf
          uf_nome: uf.nome,
          regiao: uf.regiao_sigla,
          regiao_nome: uf.regiao_nome,
          n_interrupcoes: r.n_interrupcoes,
          afetados_total: r.afetados_total,
          consumidor_hora: r.consumidor_hora,
          consumidor_hora_por_domicilio: consumidorHoraPorDomicilio,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }

  /**
   * Ranking das distribuidoras atuantes numa UF no mês, ordenado por
   * consumidor-hora perdido. Não usa DEC aqui: o denominador do DEC
   * (consumidores ativos) é do conjunto, que pode cruzar mais de uma UF, então
   * não existe um "ativos" isolado e correto por UF para dividir — consumidor-
   * hora é aditivo e não tem esse problema.
   *
   * Limitado a TOP_N_RANKING_UF por participação (ver config.ts) — só a
   * exibição é cortada; `participacao` é a window function sobre todas as
   * linhas de `atual`, calculada antes do LIMIT, então o percentual mostrado
   * continua sendo a fatia real no consumidor-hora total do estado.
   */
  async distribuidorasPorUf(ufSigla: string, competencia: string | undefined) {
    const comp = this.validarCompetencia(competencia);
    const uf = UF_POR_SIGLA.get(ufSigla.toUpperCase());
    if (!uf) {
      throw new NotFoundException(`UF "${ufSigla}" não encontrada.`);
    }

    // Mesma lógica do ranking nacional de "quem piorou" (comparar com a média
    // das competências anteriores), só que localizada: a pergunta muda de
    // "quem piorou no Brasil" para "quem piorou neste estado".
    const rows = await this.db.query<DistribuidoraUfRow>(
      `WITH atual AS (
         SELECT sig_agente, any_value(distribuidora) AS distribuidora,
                sum(n_interrupcoes)  AS n_interrupcoes,
                sum(afetados_total)  AS afetados_total,
                sum(consumidor_hora) AS consumidor_hora
         FROM distribuidora_uf_mes
         WHERE uf_codigo = ? AND strftime(competencia, '%Y-%m') = ?
         GROUP BY sig_agente
       ),
       anteriores AS (
         SELECT sig_agente, avg(consumidor_hora) AS consumidor_hora_medio_anterior
         FROM distribuidora_uf_mes
         WHERE uf_codigo = ? AND strftime(competencia, '%Y-%m') < ?
         GROUP BY sig_agente
       )
       SELECT a.sig_agente, a.distribuidora, a.n_interrupcoes, a.afetados_total,
              a.consumidor_hora,
              a.consumidor_hora / sum(a.consumidor_hora) OVER () AS participacao,
              CASE WHEN p.consumidor_hora_medio_anterior > 0
                   THEN (a.consumidor_hora - p.consumidor_hora_medio_anterior)
                        / p.consumidor_hora_medio_anterior
              END AS variacao_pct
       FROM atual a
       LEFT JOIN anteriores p USING (sig_agente)
       ORDER BY a.consumidor_hora DESC, a.sig_agente
       LIMIT ${TOP_N_RANKING_UF}`,
      [uf.codigo, comp, uf.codigo, comp],
    );

    return { uf: uf.sigla, uf_nome: uf.nome, competencia: comp, distribuidoras: rows };
  }

  /** Malha geográfica (GeoJSON) das UFs, servida como veio do IBGE — estática. */
  malhaUf(): unknown {
    return JSON.parse(
      readFileSync(resolve(REFERENCE_DIR, 'malha_uf.geojson'), 'utf-8'),
    );
  }
}
