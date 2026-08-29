#!/usr/bin/env python3
"""Preenche Latitude e Longitude em data/grupos.csv antes da publicação.

Por segurança, o modo padrão é uma simulação. Use --write para alterar o CSV.
O script consulta somente os registros que têm endereço e ainda não possuem as
duas coordenadas, respeitando o limite do serviço público do Nominatim.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = PROJECT_ROOT / "data" / "grupos.csv"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


def has_coordinates(row: dict[str, str]) -> bool:
    return bool((row.get("Latitude") or "").strip() and (row.get("Longitude") or "").strip())


def geocode(address: str, user_agent: str, timeout: int) -> tuple[str, str] | None:
    params = urlencode({"format": "json", "limit": 1, "countrycodes": "br", "q": address})
    request = Request(
        f"{NOMINATIM_URL}?{params}",
        headers={"User-Agent": user_agent, "Accept": "application/json"},
    )
    with urlopen(request, timeout=timeout) as response:
        places = json.load(response)

    if not places:
        return None
    return places[0]["lat"], places[0]["lon"]


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames:
            raise ValueError("O CSV não possui cabeçalho.")
        headers = list(reader.fieldnames)
        rows = list(reader)
    return headers, rows


def write_csv(path: Path, headers: list[str], rows: list[dict[str, str]], backup: bool) -> None:
    if backup:
        backup_path = path.with_suffix(path.suffix + ".bak")
        shutil.copy2(path, backup_path)
        print(f"Backup criado: {backup_path}")

    with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="", delete=False, dir=path.parent) as file:
        writer = csv.DictWriter(file, fieldnames=headers, extrasaction="ignore", quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)
        temporary_path = Path(file.name)

    os.replace(temporary_path, path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Preenche coordenadas ausentes no CSV de grupos.")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="Caminho do CSV a atualizar.")
    parser.add_argument("--write", action="store_true", help="Grava as coordenadas no CSV. Sem esta opção, apenas simula.")
    parser.add_argument("--no-backup", action="store_true", help="Não cria o arquivo .bak antes de gravar.")
    parser.add_argument("--delay", type=float, default=1.1, help="Intervalo mínimo entre consultas, em segundos (padrão: 1.1).")
    parser.add_argument("--timeout", type=int, default=20, help="Tempo máximo de cada consulta, em segundos.")
    parser.add_argument(
        "--user-agent",
        default="grupos-de-crescimento-csv-geocoder/1.0",
        help="Identificação enviada ao serviço de geocoding.",
    )
    args = parser.parse_args()

    if args.delay < 1:
        parser.error("--delay deve ser de pelo menos 1 segundo para respeitar o Nominatim.")
    if not args.csv.is_file():
        parser.error(f"CSV não encontrado: {args.csv}")

    headers, rows = read_csv(args.csv)
    for column in ("Latitude", "Longitude"):
        if column not in headers:
            headers.append(column)
        for row in rows:
            row.setdefault(column, "")

    pending = [row for row in rows if (row.get("Endereço") or "").strip() not in ("", "-") and not has_coordinates(row)]
    if not pending:
        print("Nenhum endereço sem coordenadas.")
        return 0

    mode = "GRAVAÇÃO" if args.write else "SIMULAÇÃO"
    print(f"{mode}: {len(pending)} endereço(s) serão consultados.")
    if not args.write:
        print("Use --write para salvar o resultado no CSV.")

    updated = 0
    not_found = 0
    errors = 0
    last_request_at = 0.0
    for index, row in enumerate(pending, start=1):
        wait = args.delay - (time.monotonic() - last_request_at)
        if wait > 0:
            time.sleep(wait)

        address = row["Endereço"].strip()
        print(f"[{index}/{len(pending)}] {row.get('Nome', 'Sem nome')}: {address}")
        try:
            coordinates = geocode(address, args.user_agent, args.timeout)
            last_request_at = time.monotonic()
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            last_request_at = time.monotonic()
            errors += 1
            print(f"  Erro: {error}", file=sys.stderr)
            continue

        if coordinates is None:
            not_found += 1
            print("  Endereço não localizado.")
            continue

        row["Latitude"], row["Longitude"] = coordinates
        updated += 1
        print(f"  {coordinates[0]}, {coordinates[1]}")

    if args.write and updated:
        write_csv(args.csv, headers, rows, backup=not args.no_backup)
        print(f"\nCSV atualizado: {updated} coordenada(s) gravada(s).")
    elif args.write:
        print("\nNenhuma coordenada foi gravada.")
    else:
        print(f"\nSimulação concluída: {updated} encontrada(s), {not_found} não localizada(s), {errors} erro(s).")

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
