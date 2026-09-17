import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseService } from '../database/database.service';

const REGEX_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

interface Uf {
  codigo: number;
  sigla: string;
  nome: string;
  regiao_sigla: string;
  regiao_nome: string;
}

const REFERENCIA_DIR = resolve(__dirname, '..', '..', '..', 'data', 'referencia');

/** UF é derivada dos dois primeiros dígitos do código IBGE do município
 * (convenção do próprio IBGE: código do município = código da UF + sufixo). */
const ufs: Uf[] = JSON.parse(
  readFileSync(resolve(REFERENCIA_DIR, 'ufs.json'), 'utf-8'),
);
const UF_POR_CODIGO = new Map(ufs.map((uf) => [uf.codigo, uf]));
const UF_POR_SIGLA = new Map(ufs.map((uf) => [uf.sigla.toUpperCase(), uf]));

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

@Injectable()
export class IndicadoresService {
  constructor(private readonly db: DatabaseService) {}

  private validarCompetencia(competencia: string | undefined): string {
    if (!competencia || !REGEX_COMPETENCIA.test(competencia)) {
      throw new BadRequestException(
        'Parâmetro "competencia" é obrigatório no formato YYYY-MM.',
      );
    }
    return competencia;
  }

  /** Lista as competências (meses) disponíveis, da mais recente para a mais antiga. */
  async competencias(): Promise<string[]> {
    const rows = await this.db.query<{ competencia: string }>(
      `SELECT DISTINCT strftime(competencia, '%Y-%m') AS competencia
       FROM distribuidora_mes
       ORDER BY competencia DESC`,
    );
    return rows.map((r) => r.competencia);
  }

  /**
   * Ranking das distribuidoras no mês, com a variação do DEC ponderado em
   * relação à média das competências anteriores disponíveis — é essa variação
   * que aponta "quem piorou". Calculada em SQL para evitar N+1 e manter a
   * API como uma camada fina sobre o DuckDB.
   */
  async distribuidoras(competencia: string | undefined) {
    const comp = this.validarCompetencia(competencia);
    return this.db.query<DistribuidoraMesRow>(
      `WITH atual AS (
         SELECT sig_agente, distribuidora, n_conjuntos, n_interrupcoes,
                consumidor_hora, dec_ponderado, fec_ponderado
         FROM distribuidora_mes
         WHERE strftime(competencia, '%Y-%m') = ?
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
       ORDER BY variacao_pct DESC NULLS LAST`,
      [comp, comp],
    );
  }

  /** Série temporal do DEC/FEC e quebra por causa de uma distribuidora. */
  async distribuidoraDetalhe(sig: string) {
    const serie = await this.db.query<SerieRow>(
      `SELECT strftime(competencia, '%Y-%m') AS competencia,
              dec_ponderado, fec_ponderado, n_interrupcoes, consumidor_hora
       FROM distribuidora_mes
       WHERE sig_agente = ?
       ORDER BY competencia`,
      [sig],
    );
    if (serie.length === 0) {
      throw new NotFoundException(`Distribuidora "${sig}" não encontrada.`);
    }

    const causas = await this.db.query<CausaRow>(
      `SELECT strftime(competencia, '%Y-%m') AS competencia,
              causa, is_programada, n_interrupcoes, afetados_total, consumidor_hora
       FROM causa_distribuidora_mes
       WHERE sig_agente = ?
       ORDER BY competencia, consumidor_hora DESC`,
      [sig],
    );

    return { sig_agente: sig, serie, causas };
  }

  /**
   * Consumidor-hora perdido por UF no mês, para colorir o mapa. Granularidade
   * de UF (não município): mais leve para renderizar e suficiente para
   * responder "onde está piorando" em um painel nacional.
   */
  async mapa(competencia: string | undefined) {
    const comp = this.validarCompetencia(competencia);
    const rows = await this.db.query<MunicipioMesRow>(
      `SELECT CAST(municipio_ibge / 100000 AS INTEGER) AS uf_codigo,
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
        return {
          uf: uf.sigla,
          uf_codigo: String(uf.codigo), // casa com "codarea" do GeoJSON de malha_uf
          uf_nome: uf.nome,
          regiao: uf.regiao_sigla,
          regiao_nome: uf.regiao_nome,
          n_interrupcoes: r.n_interrupcoes,
          afetados_total: r.afetados_total,
          consumidor_hora: r.consumidor_hora,
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
       ORDER BY variacao_pct DESC NULLS LAST`,
      [uf.codigo, comp, uf.codigo, comp],
    );

    return { uf: uf.sigla, uf_nome: uf.nome, competencia: comp, distribuidoras: rows };
  }

  /** Malha geográfica (GeoJSON) das UFs, servida como veio do IBGE — estática. */
  malhaUf(): unknown {
    return JSON.parse(
      readFileSync(resolve(REFERENCIA_DIR, 'malha_uf.geojson'), 'utf-8'),
    );
  }
}
