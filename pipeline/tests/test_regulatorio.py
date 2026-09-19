"""Testes do enriquecimento regulatório (limite legal + compensação).

Essa é a parte de maior risco do pipeline: o limite do PRODIST é ANUAL, mas
vem num arquivo com uma linha por ano em que mudou (não por ano corrente), e
a compensação vem numa tabela de códigos cifrados onde é fácil somar errado
(duplicando mensal + trimestral + anual). Os três casos abaixo replicam bugs
reais encontrados enquanto isso foi construído.
"""
from __future__ import annotations

import duckdb
import pandas as pd
import pytest

from pipeline.transform import construir_regulatorio

COLUNAS_APURADO = [
    "DatGeracaoConjuntoDados", "IdeConjUndConsumidoras", "DscConjUndConsumidoras",
    "SigAgente", "NumCNPJ", "SigIndicador", "AnoIndice", "NumPeriodoIndice",
    "VlrIndiceEnviado",
]
COLUNAS_LIMITE = [
    "DatGeracaoConjuntoDados", "SigAgente", "NumCNPJ", "IdeConjUndConsumidoras",
    "DscConjUndConsumidoras", "SigIndicador", "AnoLimiteQualidade", "VlrLimite",
]
COLUNAS_COMPENSACAO = COLUNAS_APURADO  # mesmo shape do apurado


def linha_apurado(conjunto=100, sig_agente="TESTE", ano=2026, mes=1, indicador="DEC", valor=1.0):
    return dict(zip(COLUNAS_APURADO, [
        "2026-09-05", conjunto, "Conjunto Teste", sig_agente, "00000000000100",
        indicador, ano, mes, valor,
    ]))


def linha_limite(conjunto=100, sig_agente="TESTE", ano_limite=2020, indicador="DEC", valor="30,00"):
    return dict(zip(COLUNAS_LIMITE, [
        "2026-09-05", sig_agente, "00000000000100", conjunto, "Conjunto Teste",
        indicador, ano_limite, valor,
    ]))


def linha_compensacao(conjunto=100, sig_agente="TESTE", ano=2026, mes=1, indicador="PGUCBTU", valor=100.0):
    return dict(zip(COLUNAS_COMPENSACAO, [
        "2026-09-05", conjunto, "Conjunto Teste", sig_agente, "00000000000100",
        indicador, ano, mes, valor,
    ]))


def linha_fato(conjunto=100, sig_agente="TESTE"):
    """Simula uma linha de fato_conjunto_mes — só as colunas que
    construir_regulatorio realmente lê (conjunto, sig_agente)."""
    return {"conjunto": conjunto, "sig_agente": sig_agente}


@pytest.fixture
def con():
    conexao = duckdb.connect(":memory:")
    yield conexao
    conexao.close()


def _construir(con, apurado, limite, compensacao, ano=2026, fato=None):
    if fato is None:
        fato = [linha_fato()]  # conjunto=100 -> sig_agente="TESTE", casa com os defaults acima
    con.register("bruto_apurado", pd.DataFrame(apurado, columns=COLUNAS_APURADO))
    con.register("bruto_limite", pd.DataFrame(limite, columns=COLUNAS_LIMITE))
    con.register("bruto_compensacao", pd.DataFrame(compensacao, columns=COLUNAS_COMPENSACAO))
    con.register("bruto_fato", pd.DataFrame(fato, columns=["conjunto", "sig_agente"]))
    construir_regulatorio(
        con, ano,
        apurado_src="bruto_apurado",
        limite_src="bruto_limite",
        compensacao_src="bruto_compensacao",
        fato_conjunto_src="bruto_fato",
    )


def test_limite_usa_o_mais_recente_vigente_ate_o_ano(con):
    """O dataset bruto só tem uma linha quando o limite MUDA — não uma por
    ano corrente. Pra 2026, precisa pegar o valor de 2024 (o mais recente
    que já estava em vigor), não o de 2027 (ainda não vigente)."""
    _construir(
        con,
        apurado=[linha_apurado()],
        limite=[
            linha_limite(ano_limite=2020, valor="30,00"),
            linha_limite(ano_limite=2024, valor="20,00"),
            linha_limite(ano_limite=2027, valor="10,00"),  # ainda não vigente em 2026
        ],
        compensacao=[],
        ano=2026,
    )
    (dec_limite,) = con.execute("SELECT dec_limite FROM limite_conjunto").fetchone()
    assert dec_limite == 20.0


def test_limite_com_virgula_decimal_e_convertido(con):
    """VlrLimite vem como string BR ('8,00'), não como número."""
    _construir(con, apurado=[linha_apurado()], limite=[linha_limite(valor="8,50")], compensacao=[], ano=2026)
    (dec_limite,) = con.execute("SELECT dec_limite FROM limite_conjunto").fetchone()
    assert dec_limite == 8.5


def test_transgressao_e_acumulada_no_ano_nao_por_mes_isolado(con):
    """O limite é ANUAL. Um conjunto com DEC de 15h em cada um de dois meses
    não estoura um limite de 20h olhando mês a mês (15 < 20), mas estoura
    quando acumulado (15+15=30 > 20) — é assim que o PRODIST apura de verdade."""
    _construir(
        con,
        apurado=[
            linha_apurado(mes=1, indicador="DEC", valor=15.0),
            linha_apurado(mes=2, indicador="DEC", valor=15.0),
        ],
        limite=[linha_limite(indicador="DEC", valor="20,00")],
        compensacao=[],
        ano=2026,
    )
    resultado = con.execute(
        "SELECT strftime(competencia, '%Y-%m'), n_conjuntos_acima_limite_dec "
        "FROM regulatorio_distribuidora_mes ORDER BY competencia"
    ).fetchall()
    assert resultado == [("2026-01", 0), ("2026-02", 1)]


def test_compensacao_soma_so_os_codigos_mensais(con):
    """PGUCBTU (mensal) deve entrar na soma; PGUCBTUA (anual) e PGUCTRP
    (violação de tensão, outro assunto) não — somar tudo duplicaria valor ou
    misturaria um problema diferente."""
    _construir(
        con,
        apurado=[linha_apurado()],
        limite=[],
        compensacao=[
            linha_compensacao(indicador="PGUCBTU", valor=100.0),   # mensal — entra
            linha_compensacao(indicador="PGUCBTUA", valor=1200.0),  # anual — não entra
            linha_compensacao(indicador="PGUCTRP", valor=500.0),    # tensão — não entra
        ],
        ano=2026,
    )
    (total,) = con.execute("SELECT compensacao_paga FROM compensacao_conjunto_mes").fetchone()
    assert total == 100.0


def test_distribuidora_sem_dado_regulatorio_nao_quebra(con):
    """Uma distribuidora sem limite cadastrado (l.dec_limite IS NULL) não deve
    ser contada como "acima do limite" por causa de NULL > valor ser NULL."""
    _construir(con, apurado=[linha_apurado()], limite=[], compensacao=[], ano=2026)
    (n_acima,) = con.execute("SELECT n_conjuntos_acima_limite_dec FROM regulatorio_distribuidora_mes").fetchone()
    assert n_acima == 0


def test_agrupa_pela_sigla_canonica_de_fato_conjunto_mes_nao_a_do_regulatorio(con):
    """Bug real: o dataset regulatório usa uma sigla própria por conjunto, que
    diverge da sigla do dataset de interrupções pra distribuidoras que
    passaram por aquisição/rebranding (ex.: conjunto que o regulatório ainda
    chama de "EQUATORIAL GO" e o dataset de interrupções já chama de "CELG").
    O endpoint de drill-down casa por sig_agente vindo de fato_conjunto_mes
    (via distribuidora_mes) — se regulatorio_distribuidora_mes agregasse pela
    sigla do dataset regulatório, o LEFT JOIN do endpoint nunca acharia par e
    o dado regulatório dessa distribuidora sumia em silêncio."""
    _construir(
        con,
        apurado=[linha_apurado(conjunto=100, sig_agente="EQUATORIAL GO")],  # sigla do regulatório
        limite=[],
        compensacao=[linha_compensacao(conjunto=100, sig_agente="EQUATORIAL GO", valor=500.0)],
        fato=[linha_fato(conjunto=100, sig_agente="CELG")],  # sigla canônica (interrupções)
        ano=2026,
    )
    linhas = con.execute("SELECT sig_agente, compensacao_paga FROM regulatorio_distribuidora_mes").fetchall()
    assert linhas == [("CELG", 500.0)]


def test_conjunto_sem_par_em_fato_conjunto_mes_e_descartado(con):
    """Sem sigla canônica (nenhuma interrupção correspondente no painel), o
    conjunto não tem como ser agregado por distribuidora — é descartado, não
    aparece com sig_agente nulo nem quebra a query."""
    _construir(
        con,
        apurado=[linha_apurado(conjunto=999, sig_agente="ORFAO")],
        limite=[],
        compensacao=[],
        fato=[linha_fato(conjunto=100, sig_agente="TESTE")],  # conjunto 999 não existe aqui
        ano=2026,
    )
    (total,) = con.execute("SELECT count(*) FROM regulatorio_distribuidora_mes").fetchone()
    assert total == 0
