"""Testes do cálculo de indicadores (pipeline/transform.py) contra uma fixture
sintética pequena, com entrada conhecida e saída esperada calculada à mão.

Não testamos contra o dado real da ANEEL aqui — isso já foi validado
manualmente durante o desenvolvimento (ver README, seção "Decisões de
projeto"). O que este arquivo garante é que o SQL de transformação continua
implementando corretamente as regras documentadas, mesmo depois de mudanças
futuras no código.
"""
from __future__ import annotations

from datetime import datetime

import duckdb
import pandas as pd
import pytest

from pipeline.transform import construir

COLUNAS_BRUTO = [
    "SigAgente", "NomAgente", "NumCNPJDistribuidora", "CodMunicipioIBGE",
    "CodConjUnidadeConsumidora", "DscConjuntoUnidadeConsumidora",
    "AnoCompetencia", "MesCompetencia", "QtdConsumidoresAfetados",
    "QtdConsumidoresAtivos", "DatInicioInterrupcao", "DatFimInterrupcao",
    "DscFatoGeradorTipo", "DscFatoGeradorCausa", "DscMotivoExpurgo",
]


def linha(
    sig_agente="TESTE               ",  # padding fixo, como vem da ANEEL
    nom_agente="DISTRIBUIDORA TESTE",
    cnpj="00000000000100",
    municipio=3550308,  # São Paulo/SP (uf 35)
    conjunto="CONJ-A",
    conjunto_nome="Conjunto A",
    ano=2026,
    mes=1,
    afetados=100,
    ativos=1000,
    inicio=datetime(2026, 1, 10, 8, 0),
    fim=datetime(2026, 1, 10, 10, 0),  # 2h de duração por padrão
    tipo="Não Programada",
    causa="Meio Ambiente",
    expurgo="Não houve Expurgo",
) -> dict:
    return dict(zip(COLUNAS_BRUTO, [
        sig_agente, nom_agente, cnpj, municipio, conjunto, conjunto_nome,
        ano, mes, afetados, ativos, inicio, fim, tipo, causa, expurgo,
    ]))


@pytest.fixture
def con():
    conexao = duckdb.connect(":memory:")
    yield conexao
    conexao.close()


def _carregar(con: duckdb.DuckDBPyConnection, linhas: list[dict]) -> str:
    bruto = pd.DataFrame(linhas, columns=COLUNAS_BRUTO)
    con.register("bruto", bruto)
    construir(con, "bruto")
    return "bruto"


def test_dec_fec_calculados_corretamente(con):
    """DEC = consumidor-hora / ativos; FEC = afetados / ativos, no grão do conjunto."""
    _carregar(con, [
        # duas interrupções no mesmo conjunto/mês: 100×2h + 50×4h = 400 consumidor-hora
        linha(afetados=100, ativos=1000, inicio=datetime(2026, 1, 10, 8, 0), fim=datetime(2026, 1, 10, 10, 0)),
        linha(afetados=50, ativos=1000, inicio=datetime(2026, 1, 15, 8, 0), fim=datetime(2026, 1, 15, 12, 0)),
    ])
    resultado = con.execute(
        "SELECT n_interrupcoes, afetados_total, consumidor_hora, dec, fec FROM fato_conjunto_mes"
    ).fetchone()
    n_interrupcoes, afetados_total, consumidor_hora, dec, fec = resultado
    assert n_interrupcoes == 2
    assert afetados_total == 150
    assert consumidor_hora == pytest.approx(400.0)
    assert dec == pytest.approx(0.4)  # 400 / 1000
    assert fec == pytest.approx(0.15)  # 150 / 1000


def test_outlier_afetados_maior_que_ativos_e_limitado(con):
    """QtdConsumidoresAfetados > QtdConsumidoresAtivos é um erro de lançamento no
    dado bruto (confirmado durante a exploração): a linha é mantida, mas o valor
    é limitado ao total de ativos (LEAST), nunca ultrapassando 100% dos clientes."""
    _carregar(con, [
        linha(afetados=2000, ativos=500, inicio=datetime(2026, 1, 1, 0, 0), fim=datetime(2026, 1, 1, 1, 0)),
    ])
    afetados_total, ativos = con.execute(
        "SELECT afetados_total, ativos FROM fato_conjunto_mes"
    ).fetchone()
    assert afetados_total == 500
    assert ativos == 500


def test_interrupcao_expurgada_e_excluida(con):
    """Só motivo 'Não houve Expurgo' compõe o indicador; expurgos regulatórios
    (situação de emergência, dia crítico etc.) ficam de fora do cálculo."""
    _carregar(con, [
        linha(expurgo="Não houve Expurgo", afetados=100),
        linha(expurgo="Situação de Emergência", afetados=999999),
    ])
    (total,) = con.execute("SELECT sum(afetados_total) FROM fato_conjunto_mes").fetchone()
    assert total == 100  # a linha expurgada (999999) não deve aparecer


def test_municipio_vem_da_linha_nao_do_conjunto(con):
    """Um conjunto pode cruzar vários municípios — o roll-up geográfico agrega
    pela linha (evento), não herda um único município do conjunto."""
    _carregar(con, [
        linha(conjunto="CONJ-A", municipio=3550308),  # São Paulo/SP
        linha(conjunto="CONJ-A", municipio=3304557),  # Rio de Janeiro/RJ
    ])
    municipios = con.execute(
        "SELECT municipio_ibge FROM municipio_mes ORDER BY municipio_ibge"
    ).fetchall()
    assert [m[0] for m in municipios] == [3304557, 3550308]


def test_uf_derivada_do_codigo_do_municipio(con):
    """UF = dois primeiros dígitos do código IBGE do município (35xxxxx = SP,
    33xxxxx = RJ), sem depender de join com tabela de municípios."""
    _carregar(con, [
        linha(sig_agente="DIST1", municipio=3550308),  # SP
        linha(sig_agente="DIST1", municipio=3304557),  # RJ
    ])
    ufs = con.execute(
        "SELECT DISTINCT uf_codigo FROM distribuidora_uf_mes ORDER BY uf_codigo"
    ).fetchall()
    assert [u[0] for u in ufs] == [33, 35]


def test_sig_agente_com_padding_e_removido(con):
    """SigAgente chega com espaços de preenchimento (campo de largura fixa);
    vira identificador em URL/JSON, então precisa estar aparado."""
    _carregar(con, [linha(sig_agente="ABC                 ")])
    (sig,) = con.execute("SELECT DISTINCT sig_agente FROM distribuidora_mes").fetchone()
    assert sig == "ABC"


@pytest.mark.parametrize(
    "tipo_bruto,esperado",
    [
        ("Programada", True),
        ("Não Programada", False),
        ("NAO PROGRAMADA", False),  # sem acento / maiúsculo, como pode variar no bruto
        (None, None),
    ],
)
def test_classificacao_programada_vs_nao_programada(con, tipo_bruto, esperado):
    _carregar(con, [linha(tipo=tipo_bruto)])
    (is_programada,) = con.execute(
        "SELECT is_programada FROM causa_distribuidora_mes"
    ).fetchone()
    assert is_programada is esperado


def test_conjunto_sem_ativos_e_excluido(con):
    """QtdConsumidoresAtivos = 0 tornaria o denominador do DEC/FEC inválido
    (divisão por zero) — a linha é descartada antes de chegar aos indicadores."""
    _carregar(con, [linha(ativos=0)])
    (total,) = con.execute("SELECT count(*) FROM fato_conjunto_mes").fetchone()
    assert total == 0
