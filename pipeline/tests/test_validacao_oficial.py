"""Validação cruzada do DEC e do FEC calculados contra os valores oficiais da
ANEEL.

O dataset de indicadores coletivos traz, além do que calculamos a partir do
dado bruto de interrupções (`fato_conjunto_mes.dec`/`.fec`), os valores que a
própria ANEEL apurou oficialmente (`apurado_oficial_conjunto_mes.dec_oficial`/
`.fec_oficial`). Uma checagem manual (ver README, seção "Decisões de projeto"
> "Validação cruzada, com divergência documentada") mediu, sobre o dado real:
~90% dos conjuntos-mês batem até 0,01 de diferença, tanto em DEC (horas)
quanto em FEC (interrupções por consumidor), com diferença mediana de
~0,003 nos dois casos. Este teste automatiza essa checagem para que ela não
dependa de alguém rodar a query manualmente de novo a cada mudança no
pipeline.

A divergência nos ~10% restantes já foi investigada e não é um bug: são
conjuntos com interrupções de duração extrema (algumas acima de 400h, uma
chegando a ~3.600h) que a ANEEL aparentemente trata com uma metodologia
própria não exposta no dado público (um teto de duração ou reclassificação).
Por isso os limiares abaixo não exigem 100% de concordância nem diferença
zero — exigem que o comportamento observado (~90%/~0,003) não regrida.

O FEC especificamente só chegou a essa concordância depois de um ajuste: o
cálculo original contava toda interrupção, mas o PRODIST/a ANEEL não contam
no FEC interrupção com duração menor que 3 minutos — sem esse filtro
(`DUR_MIN_FEC_H` em transform.py), nosso FEC ficava ~11% acima do oficial em
média. DEC e consumidor-hora continuam somando a duração real de tudo, sem
esse corte — ele é específico do FEC.

Diferente dos testes em test_transform.py e test_regulatorio.py, que usam
duckdb em memória com fixtures sintéticas para testar casos de borda
específicos da lógica de transformação, este teste precisa de dado real: uma
fração de concordância só é uma checagem significativa se calculada sobre o
volume real de conjuntos-mês, não sobre alguns poucos registros inventados à
mão. Por isso ele lê o `indicadores.duckdb` já processado (`data/processed/`,
gerado localmente pelo pipeline) ou, na ausência dele, o seed pequeno e
pré-processado em `data/seed/` — que é versionado no Git (ver `.gitignore`) e
mantido atualizado todo mês pelo workflow de backfill
(`.github/workflows/backfill-mensal.yml`). Isso também é o que faz este teste
funcionar em CI/clone limpo sem depender do Parquet bruto (que não vai para o
Git): se nenhum dos dois arquivos existir, o teste é pulado com uma mensagem
explicando como gerá-lo.
"""
from __future__ import annotations

from pathlib import Path

import duckdb
import pytest

# Tolerância por par (conjunto, competência) — mesmo limiar usado na
# validação manual documentada no README, em horas pro DEC e em
# interrupções-por-consumidor pro FEC (escalas parecidas na prática).
TOLERANCIA = 0.01

# Piso da fração de pares dentro da tolerância. A medição manual deu ~90%
# (DEC) e ~91% (FEC); o piso fica em 88% (folga de alguns p.p.) para não
# quebrar por ruído de republicação mensal da ANEEL, mas ainda quebra se a
# concordância cair de verdade (ex.: regressão na lógica de cálculo).
PISO_CONCORDANCIA = 0.88

# Teto da diferença mediana. A medição manual deu ~0,003 nos dois
# indicadores; o teto em 0,05 dá bastante folga (mais de 15x) porque a
# mediana é dominada pelos ~90% de pares "bons" e por isso é bem mais
# estável mês a mês que a fração de concordância — não precisa da mesma
# margem.
TETO_MEDIANA = 0.05


def _caminho_indicadores() -> Path | None:
    raiz = Path(__file__).resolve().parents[2]
    candidatos = [
        raiz / "data" / "processed" / "indicadores.duckdb",  # gerado localmente pelo pipeline
        raiz / "data" / "seed" / "indicadores.duckdb",       # versionado no Git, sempre presente
    ]
    return next((c for c in candidatos if c.exists()), None)


def _pares(coluna_nossa: str, coluna_oficial: str):
    caminho = _caminho_indicadores()
    if caminho is None:
        pytest.skip(
            "indicadores.duckdb não encontrado em data/processed/ nem em data/seed/. "
            "Rode `python -m pipeline.ingest && python -m pipeline.ingest_continuidade "
            "&& python -m pipeline.transform` para gerá-lo, ou confira se data/seed/ "
            "foi clonado corretamente (é versionado no Git, não deveria faltar)."
        )
    conexao = duckdb.connect(str(caminho), read_only=True)
    try:
        return conexao.execute(f"""
            SELECT
                f.conjunto,
                f.competencia,
                f.{coluna_nossa},
                o.{coluna_oficial},
                abs(f.{coluna_nossa} - o.{coluna_oficial}) AS diferenca
            FROM fato_conjunto_mes f
            JOIN apurado_oficial_conjunto_mes o
              ON f.conjunto = o.conjunto AND f.competencia = o.competencia
            WHERE f.{coluna_nossa} IS NOT NULL AND o.{coluna_oficial} IS NOT NULL
        """).fetchdf()
    finally:
        conexao.close()


@pytest.fixture(scope="module")
def pares_dec():
    return _pares("dec", "dec_oficial")


@pytest.fixture(scope="module")
def pares_fec():
    return _pares("fec", "fec_oficial")


def test_ha_pares_para_comparar(pares_dec):
    """Sanidade: se o join não casar nenhum par, os testes abaixo passariam
    trivialmente (mean/median de uma série vazia) sem checar nada de verdade."""
    assert len(pares_dec) > 0


def test_concordancia_com_dec_oficial_dentro_do_piso(pares_dec):
    dentro_da_tolerancia = pares_dec["diferenca"] <= TOLERANCIA
    fracao = dentro_da_tolerancia.mean()
    assert fracao >= PISO_CONCORDANCIA, (
        f"Concordância com o DEC oficial caiu para {fracao:.1%} "
        f"({dentro_da_tolerancia.sum()}/{len(pares_dec)} pares dentro de "
        f"{TOLERANCIA}h), abaixo do piso de {PISO_CONCORDANCIA:.0%}."
    )


def test_divergencia_mediana_dec_e_pequena(pares_dec):
    mediana = pares_dec["diferenca"].median()
    assert mediana <= TETO_MEDIANA, (
        f"Diferença mediana entre DEC calculado e oficial subiu para "
        f"{mediana:.4f}h, acima do teto de {TETO_MEDIANA}h."
    )


def test_ha_pares_para_comparar_fec(pares_fec):
    assert len(pares_fec) > 0


def test_concordancia_com_fec_oficial_dentro_do_piso(pares_fec):
    dentro_da_tolerancia = pares_fec["diferenca"] <= TOLERANCIA
    fracao = dentro_da_tolerancia.mean()
    assert fracao >= PISO_CONCORDANCIA, (
        f"Concordância com o FEC oficial caiu para {fracao:.1%} "
        f"({dentro_da_tolerancia.sum()}/{len(pares_fec)} pares dentro de "
        f"{TOLERANCIA}), abaixo do piso de {PISO_CONCORDANCIA:.0%}. Isso "
        "quebra se alguém mexer no filtro de 3 minutos (DUR_MIN_FEC_H) em "
        "transform.py sem querer."
    )


def test_divergencia_mediana_fec_e_pequena(pares_fec):
    mediana = pares_fec["diferenca"].median()
    assert mediana <= TETO_MEDIANA, (
        f"Diferença mediana entre FEC calculado e oficial subiu para "
        f"{mediana:.4f}, acima do teto de {TETO_MEDIANA}."
    )
