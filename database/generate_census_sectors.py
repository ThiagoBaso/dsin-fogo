"""Download the 2022 IBGE census mesh and export Marília's sector polygons."""
from __future__ import annotations

import io
import json
import os
import zipfile
from pathlib import Path
from urllib.request import urlretrieve

import shapefile
from pyproj import Transformer
from shapely import transform as transform_geometry
from shapely.geometry import mapping, shape

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = (
    "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/"
    "malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/"
    "setores/shp/UF/SP_setores_CD2022.zip"
)
ARCHIVE = ROOT / "cache" / "SP_setores_CD2022.zip"
OUTPUT = ROOT / "api" / "data" / "setores-censitarios-marilia-2022.geojson"
MUNICIPAL_CODE = "3529005"
IBGE_CRS = "EPSG:4674"
GEOJSON_CRS = "EPSG:4326"


def archive_path() -> Path:
    if ARCHIVE.exists():
        return ARCHIVE

    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    temporary = ARCHIVE.with_suffix(".zip.tmp")
    urlretrieve(SOURCE_URL, temporary)
    os.replace(temporary, ARCHIVE)
    return ARCHIVE


def read_city_sectors() -> list[dict]:
    archive = archive_path()
    with zipfile.ZipFile(archive) as bundle:
        names = {Path(name).suffix.lower(): name for name in bundle.namelist()}
        reader = shapefile.Reader(
            shp=io.BytesIO(bundle.read(names[".shp"])),
            shx=io.BytesIO(bundle.read(names[".shx"])),
            dbf=io.BytesIO(bundle.read(names[".dbf"])),
            encoding="utf-8",
        )
        fields = [field[0] for field in reader.fields[1:]]
        to_geojson = Transformer.from_crs(IBGE_CRS, GEOJSON_CRS, always_xy=True)
        to_geojson_transform = to_geojson.transform
        sectors = []

        for shape_record in reader.iterShapeRecords():
            attributes = dict(zip(fields, shape_record.record))
            if str(attributes["CD_MUN"]) != MUNICIPAL_CODE:
                continue

            geometry = shape(shape_record.shape.__geo_interface__)
            geographic = transform_geometry(geometry, to_geojson_transform, interleaved=False)
            sectors.append({
                "codigo": str(attributes["CD_SETOR"]),
                "distrito_codigo": str(attributes["CD_DIST"]),
                "distrito": str(attributes["NM_DIST"]).strip(),
                "situacao": str(attributes["SITUACAO"]).strip(),
                "area_km2": float(attributes["AREA_KM2"]),
                "geometry": mapping(geographic),
            })
        reader.close()

    sectors.sort(key=lambda sector: sector["codigo"])
    if not sectors:
        raise RuntimeError(f"No IBGE census sectors found for municipality {MUNICIPAL_CODE}")

    district_ids = {
        code: index
        for index, code in enumerate(sorted({sector["distrito_codigo"] for sector in sectors}), start=1)
    }
    features = []
    for area_id, sector in enumerate(sectors, start=1):
        sector_number = sector["codigo"][-6:]
        district = sector["distrito"]
        features.append({
            "type": "Feature",
            "properties": {
                "id": area_id,
                "codigo_setor": sector["codigo"],
                "nome": f"Setor censitário {sector_number} · {district}",
                "distrito_id": district_ids[sector["distrito_codigo"]],
                "distrito_codigo": sector["distrito_codigo"],
                "distrito": district,
                "situacao": sector["situacao"],
                "area_km2": sector["area_km2"],
            },
            "geometry": sector["geometry"],
        })

    return features


def generate() -> None:
    features = read_city_sectors()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps({
            "type": "FeatureCollection",
            "name": "setores_censitarios_marilia_2022",
            "source": "IBGE · Malha de Setores Censitários 2022",
            "municipio_codigo": MUNICIPAL_CODE,
            "features": features,
        }, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Generated {len(features)} IBGE census sectors for Marília")


if __name__ == "__main__":
    generate()
