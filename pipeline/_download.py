"""Download idempotente compartilhado entre os módulos de ingestão.

Extraído de ingest.py para ser reaproveitado por qualquer dataset da ANEEL
que siga o mesmo padrão: compara o `last_modified` do recurso no CKAN com o
`.meta.json` salvo localmente, e só baixa de novo se mudou na origem.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import requests

log = logging.getLogger("ingest")

TIMEOUT = 300
UA = {"User-Agent": "monitor-continuidade-aneel/0.1"}


def _meta_path(destino: Path) -> Path:
    return destino.with_suffix(destino.suffix + ".meta.json")


def _ler_meta(destino: Path) -> dict | None:
    mp = _meta_path(destino)
    return json.loads(mp.read_text()) if mp.exists() else None


def baixar_se_novo(recurso: dict, destino: Path) -> bool:
    """Baixa o recurso se ainda não existe localmente ou se mudou na origem.

    Retorna True se baixou algo novo, False se o local já estava atualizado.
    """
    remoto_mod = recurso.get("last_modified") or recurso.get("metadata_modified") or ""
    meta = _ler_meta(destino)
    if destino.exists() and meta and meta.get("last_modified") == remoto_mod:
        log.info("Já atualizado (last_modified=%s) — nada a baixar.", remoto_mod or "?")
        return False

    url = recurso["url"]
    log.info("Baixando %s", url)
    tmp = destino.with_suffix(destino.suffix + ".part")
    with requests.get(url, stream=True, headers=UA, timeout=TIMEOUT) as r:
        r.raise_for_status()
        total = int(r.headers.get("Content-Length", 0))
        baixado = 0
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
                baixado += len(chunk)
                if total:
                    print(f"\r  {baixado/1_048_576:,.1f}/{total/1_048_576:,.1f} MB "
                          f"({100*baixado/total:4.1f}%)", end="")
    print()
    tmp.replace(destino)

    _meta_path(destino).write_text(json.dumps({
        "last_modified": remoto_mod,
        "url": url,
        "resource_id": recurso.get("id"),
        "downloaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "size_bytes": destino.stat().st_size,
    }, indent=2, ensure_ascii=False))

    log.info("Salvo em %s (%.1f MB)", destino, destino.stat().st_size / 1_048_576)
    return True
