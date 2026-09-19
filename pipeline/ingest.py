"""Ingestão idempotente do dataset de interrupções da ANEEL.

Descobre o recurso Parquet do ano de competência via API do CKAN (em vez de
fixar a URL no código), compara o `last_modified` remoto com o do arquivo já
baixado e só transfere quando há dado novo. É esse mecanismo que torna o
pipeline apto à atualização mensal publicada pela ANEEL.

Uso:
    python -m pipeline.ingest              # ano corrente
    ANO_INGESTAO=2025 python -m pipeline.ingest
"""
from __future__ import annotations

import logging
from pathlib import Path

import requests

from pipeline import config
from pipeline._download import TIMEOUT, UA, baixar_se_novo

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ingest")


def descobrir_recurso(ano: int) -> dict:
    """Consulta a API do CKAN e retorna o recurso Parquet do ano informado."""
    url = f"{config.CKAN_BASE}/api/3/action/package_show"
    log.info("Consultando catálogo da ANEEL para o ano %s.", ano)
    resp = requests.get(url, params={"id": config.DATASET_ID}, headers=UA, timeout=TIMEOUT)
    resp.raise_for_status()
    recursos = resp.json()["result"]["resources"]

    candidatos = [
        r for r in recursos
        if (r.get("format") or "").upper() == "PARQUET"
        and str(ano) in (r.get("name") or "")
    ]
    if not candidatos:
        raise RuntimeError(f"Nenhum recurso Parquet encontrado para o ano {ano}.")
    if len(candidatos) > 1:
        log.warning("Mais de um recurso Parquet para %s; usando o primeiro.", ano)
    return candidatos[0]


def ingerir(ano: int = config.ANO_INGESTAO) -> Path:
    recurso = descobrir_recurso(ano)
    destino = config.caminho_bruto(ano)
    baixar_se_novo(recurso, destino)
    return destino


if __name__ == "__main__":
    caminho = ingerir()
    log.info("Ingestão concluída: %s", caminho)
