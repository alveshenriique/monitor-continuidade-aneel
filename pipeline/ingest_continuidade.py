"""Ingestão idempotente do dataset "Indicadores Coletivos de Continuidade".

Diferente de ingest.py (um recurso Parquet por ano de competência), este
dataset publica os recursos com nome fixo, cobrindo várias décadas de uma
vez só — por isso a descoberta é por nome exato do recurso, não por ano.

Traz três coisas que o dataset de interrupções não tem: o valor de DEC/FEC
oficialmente apurado pela ANEEL (pra validar nosso próprio cálculo), o limite
legal vigente por conjunto, e o valor em R$ de compensação pago aos
consumidores por violação desses limites — é isso que transforma "a
distribuidora piorou X%" em "a distribuidora descumpriu o limite legal e
pagou R$ Y em compensação".

Uso:
    python -m pipeline.ingest_continuidade
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
log = logging.getLogger("ingest_continuidade")


def descobrir_recurso_por_nome(nome: str) -> dict:
    """Consulta a API do CKAN e retorna o recurso com esse nome exato."""
    url = f"{config.CKAN_BASE}/api/3/action/package_show"
    resp = requests.get(
        url, params={"id": config.DATASET_ID_CONTINUIDADE}, headers=UA, timeout=TIMEOUT,
    )
    resp.raise_for_status()
    recursos = resp.json()["result"]["resources"]

    candidatos = [r for r in recursos if r.get("name") == nome]
    if not candidatos:
        raise RuntimeError(f"Recurso '{nome}' não encontrado no dataset de continuidade.")
    return candidatos[0]


def ingerir_continuidade() -> dict[str, Path]:
    caminhos = {}
    for chave, nome in config.RECURSOS_CONTINUIDADE.items():
        log.info("Consultando recurso '%s' (%s).", chave, nome)
        recurso = descobrir_recurso_por_nome(nome)
        destino = config.caminho_continuidade(chave)
        baixar_se_novo(recurso, destino)
        caminhos[chave] = destino
    return caminhos


if __name__ == "__main__":
    caminhos = ingerir_continuidade()
    for chave, caminho in caminhos.items():
        log.info("%s: %s", chave, caminho)
