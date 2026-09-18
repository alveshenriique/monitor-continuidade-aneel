"""Transformação: dado bruto de interrupções -> indicadores de continuidade.

Lê o Parquet do ano de competência, limpa, calcula DEC/FEC e consumidor-hora
perdido, e gera roll-ups por distribuidora, município e causa. O resultado
(pequeno) é persistido em data/processed/indicadores.duckdb, que a API serve.

Decisões de modelagem (documentadas para o README/vídeo):
  - DEC/FEC calculados no grão do CONJUNTO (denominador correto: total de
    consumidores ativos do conjunto), conforme PRODIST Módulo 8.
  - Métricas por MUNICÍPIO vêm direto da linha de interrupção (cada evento tem
    seu próprio CodMunicipioIBGE), pois um conjunto cruza vários municípios
    (média de ~8,6 municípios por conjunto neste dado).
  - Consumidor-hora perdido (afetados x duração) é a métrica de impacto do mapa.
  - Outliers (afetados > ativos) são limitados ao total de ativos (LEAST).
  - Excluídas as interrupções com expurgo regulatório (situação de emergência,
    dia crítico, falha na instalação do consumidor etc.); mantidas as de motivo
    "Não houve Expurgo", que são as que compõem os indicadores de continuidade.
  - SigAgente vem com padding fixo (20 caracteres, preenchido com espaços) no
    bruto; aplicado trim() para servir como identificador em URLs/JSON.

Uso:
    python -m pipeline.transform
    ANO_INGESTAO=2026 python -m pipeline.transform
"""
from __future__ import annotations

import logging

import duckdb

from pipeline import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("transform")

DB_PATH = config.PROCESSED_DIR / "indicadores.duckdb"

# Expressões reutilizadas -----------------------------------------------------
DUR_H = "date_diff('second', DatInicioInterrupcao, DatFimInterrupcao) / 3600.0"
AFETADOS = "LEAST(QtdConsumidoresAfetados, QtdConsumidoresAtivos)"  # cap outliers
# Considera no indicador apenas o que NÃO foi expurgado.
SEM_EXPURGO = "trim(DscMotivoExpurgo) = 'Não houve Expurgo'"
FATO_TIPO = "upper(strip_accents(coalesce(DscFatoGeradorTipo, '')))"
IS_PROGRAMADA = (
    "CASE WHEN " + FATO_TIPO + " LIKE '%NAO PROGRAMADA%' THEN FALSE "
    "WHEN " + FATO_TIPO + " LIKE '%PROGRAMADA%' THEN TRUE ELSE NULL END"
)
CAUSA_NORM = "nullif(trim(upper(strip_accents(DscFatoGeradorCausa))), '')"


def raio_x(con: duckdb.DuckDBPyConnection, src: str) -> None:
    """Imprime sanidade do arquivo antes de transformar (validação em linha)."""
    def show(titulo: str, sql: str) -> None:
        print("\n--- " + titulo + " ---")
        print(con.execute(sql).df().to_string(index=False))

    (n,) = con.execute(f"SELECT count(*) FROM {src}").fetchone()
    print(f"\nLinhas no bruto: {n:,}")

    show("Expurgo (mantidas vs excluídas)", f"""
        SELECT count(*) FILTER (WHERE {SEM_EXPURGO})     AS mantidas,
               count(*) FILTER (WHERE NOT {SEM_EXPURGO}) AS excluidas,
               round(100.0 * count(*) FILTER (WHERE {SEM_EXPURGO}) / count(*), 1) AS pct_mantidas
        FROM {src}
    """)
    show("Municípios distintos (base do mapa)", f"""
        SELECT count(DISTINCT CodMunicipioIBGE) AS municipios FROM {src}
        WHERE {SEM_EXPURGO}
    """)


def construir(con: duckdb.DuckDBPyConnection, src: str) -> None:
    """Cria as tabelas de indicadores no banco persistido."""
    # Base limpa: uma linha por interrupção válida (sem expurgo), enriquecida.
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE base AS
        SELECT
            trim(SigAgente)                             AS sig_agente,
            NomAgente                                   AS distribuidora,
            NumCNPJDistribuidora                        AS cnpj,
            CodMunicipioIBGE                            AS municipio_ibge,
            CodMunicipioIBGE // 100000                  AS uf_codigo, -- 2 primeiros dígitos do código IBGE do município (divisão inteira: "/" do DuckDB arredonda em vez de truncar)
            CodConjUnidadeConsumidora                   AS conjunto,
            DscConjuntoUnidadeConsumidora               AS conjunto_nome,
            make_date(CAST(AnoCompetencia AS INT),
                      CAST(MesCompetencia AS INT), 1)   AS competencia,
            {AFETADOS}                                  AS afetados,
            QtdConsumidoresAtivos                       AS ativos,
            {DUR_H}                                     AS dur_h,
            {IS_PROGRAMADA}                             AS is_programada,
            coalesce({CAUSA_NORM}, 'NAO INFORMADA')     AS causa
        FROM {src}
        WHERE {SEM_EXPURGO}
          AND DatFimInterrupcao >= DatInicioInterrupcao
          AND QtdConsumidoresAtivos > 0
          AND QtdConsumidoresAfetados IS NOT NULL
    """)

    # Grão regulatório: DEC/FEC por conjunto/mês.
    con.execute("""
        CREATE OR REPLACE TABLE fato_conjunto_mes AS
        SELECT sig_agente, any_value(distribuidora) AS distribuidora, cnpj,
               conjunto, any_value(conjunto_nome) AS conjunto_nome, competencia,
               count(*)                       AS n_interrupcoes,
               sum(afetados)                  AS afetados_total,
               sum(afetados * dur_h)          AS consumidor_hora,
               max(ativos)                    AS ativos,
               sum(afetados * dur_h) / max(ativos) AS dec,
               sum(afetados)        / max(ativos) AS fec
        FROM base
        GROUP BY sig_agente, cnpj, conjunto, competencia
    """)

    # Roll-up por distribuidora/mês (DEC ponderado por consumidores).
    con.execute("""
        CREATE OR REPLACE TABLE distribuidora_mes AS
        SELECT sig_agente, any_value(distribuidora) AS distribuidora, competencia,
               count(DISTINCT conjunto)       AS n_conjuntos,
               sum(n_interrupcoes)            AS n_interrupcoes,
               sum(consumidor_hora)           AS consumidor_hora,
               sum(dec * ativos) / sum(ativos) AS dec_ponderado,
               sum(fec * ativos) / sum(ativos) AS fec_ponderado
        FROM fato_conjunto_mes
        GROUP BY sig_agente, competencia
    """)

    # Roll-up por município/mês — DIRETO DA LINHA (conjunto cruza municípios).
    con.execute("""
        CREATE OR REPLACE TABLE municipio_mes AS
        SELECT municipio_ibge, competencia,
               count(*)              AS n_interrupcoes,
               sum(afetados)         AS afetados_total,
               sum(afetados * dur_h) AS consumidor_hora
        FROM base
        GROUP BY municipio_ibge, competencia
    """)

    # Roll-up por distribuidora/UF/mês — quem atua em cada estado, pro clique no
    # mapa. Ranqueado por consumidor-hora (aditivo); DEC não é usado aqui porque
    # seu denominador (consumidores ativos) é do conjunto, que cruza UFs, então
    # não tem um valor "ativos" correto e isolado por UF pra dividir.
    con.execute("""
        CREATE OR REPLACE TABLE distribuidora_uf_mes AS
        SELECT sig_agente, any_value(distribuidora) AS distribuidora,
               uf_codigo, competencia,
               count(*)              AS n_interrupcoes,
               sum(afetados)         AS afetados_total,
               sum(afetados * dur_h) AS consumidor_hora
        FROM base
        WHERE uf_codigo BETWEEN 11 AND 53
        GROUP BY sig_agente, uf_codigo, competencia
    """)

    # Quebra por causa, por distribuidora/mês (para o drill-down).
    con.execute("""
        CREATE OR REPLACE TABLE causa_distribuidora_mes AS
        SELECT sig_agente, competencia, causa, is_programada,
               count(*)              AS n_interrupcoes,
               sum(afetados)         AS afetados_total,
               sum(afetados * dur_h) AS consumidor_hora
        FROM base
        GROUP BY sig_agente, competencia, causa, is_programada
    """)


def main() -> None:
    bruto = config.caminho_bruto()
    if not bruto.exists():
        raise SystemExit(f"Arquivo bruto não encontrado: {bruto}. Rode `python -m pipeline.ingest` antes.")

    con = duckdb.connect(str(DB_PATH))
    src = f"read_parquet('{bruto}')"
    log.info("Lendo bruto: %s", bruto)

    raio_x(con, src)

    log.info("Construindo tabelas de indicadores...")
    construir(con, src)

    print("\n=== Tabelas geradas ===")
    for t in ("fato_conjunto_mes", "distribuidora_mes", "municipio_mes",
              "distribuidora_uf_mes", "causa_distribuidora_mes"):
        (linhas,) = con.execute(f"SELECT count(*) FROM {t}").fetchone()
        print(f"  {t:<28} {linhas:>8,} linhas")

    print("\n=== Sanidade do DEC por distribuidora/mês ===")
    print(con.execute("""
        SELECT round(median(dec_ponderado), 2) AS dec_mediana_h,
               round(quantile_cont(dec_ponderado, 0.95), 2) AS dec_p95_h,
               round(max(dec_ponderado), 2) AS dec_max_h
        FROM distribuidora_mes
    """).df().to_string(index=False))

    print("\n=== Amostra: piores distribuidoras no mês mais recente ===")
    print(con.execute("""
        SELECT sig_agente, distribuidora, competencia,
               round(dec_ponderado, 2) AS dec_h, n_interrupcoes
        FROM distribuidora_mes
        WHERE competencia = (SELECT max(competencia) FROM distribuidora_mes)
        ORDER BY dec_ponderado DESC LIMIT 8
    """).df().to_string(index=False))

    con.close()
    log.info("Indicadores persistidos em %s", DB_PATH)


if __name__ == "__main__":
    main()