"""Configuração central do pipeline de dados."""
from __future__ import annotations

import os
from datetime import date
from pathlib import Path

# Fonte de dados (ANEEL / portal CKAN)
CKAN_BASE = "https://dadosabertos.aneel.gov.br"
DATASET_ID = "interrupcoes-de-energia-eletrica-nas-redes-de-distribuicao"

# Segundo dataset: limites legais de DEC/FEC, valor oficial apurado pela ANEEL
# e compensação paga aos consumidores por violação desses limites. Enriquece
# o "quem piorou" (uma variação percentual) com uma base legal e um valor em
# R$ ("quem descumpriu a norma e quanto pagou por isso").
DATASET_ID_CONTINUIDADE = "indicadores-coletivos-de-continuidade-dec-e-fec"
RECURSOS_CONTINUIDADE = {
    "apurado": "indicadores-continuidade-coletivos-2020-2029.parquet",
    "limite": "indicadores-continuidade-coletivos-limite",
    "compensacao": "indicadores-continuidade-coletivos-compensacao-2020-2029.parquet",
}

# A ANEEL publica um arquivo por ano de competência; o do ano corrente é
# atualizado mensalmente. Por padrão ingerimos o ano corrente; a variável de
# ambiente ANO_INGESTAO permite reprocessar um ano específico.
ANO_INGESTAO = int(os.getenv("ANO_INGESTAO", date.today().year))

# Diretórios do projeto
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"

for _d in (RAW_DIR, PROCESSED_DIR):
    _d.mkdir(parents=True, exist_ok=True)


def caminho_bruto(ano: int = ANO_INGESTAO) -> Path:
    return RAW_DIR / f"interrupcoes-energia-eletrica-{ano}.parquet"


def caminho_continuidade(chave: str) -> Path:
    """chave: 'apurado', 'limite' ou 'compensacao' (ver RECURSOS_CONTINUIDADE)."""
    nome = RECURSOS_CONTINUIDADE[chave]
    extensao = "parquet" if nome.lower().endswith(".parquet") else "csv"
    return RAW_DIR / f"continuidade-{chave}.{extensao}"
