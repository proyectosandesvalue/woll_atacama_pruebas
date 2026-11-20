import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildRasterIndex,
  buildRasterManifest,
  defaultLegend,
  estimateTileCount,
  layerSlug,
  normalizeLegend,
  parseGdalInfo,
  parsePublishArgs,
  parseStatsCsv,
  parseSyncArgs,
  verifyVersion,
} from "../lib/raster-utils.mjs";
import { validarConfiguracionGlobal } from "../../js/utils/configValidator.js";

test("layerSlug normaliza tildes y espacios", () => {
  assert.equal(layerSlug("Aptitud Jojoba / Atacama"), "aptitud_jojoba_atacama");
  assert.equal(layerSlug("  "), "layer");
});

test("parsePublishArgs exige los campos mínimos", () => {
  assert.throws(() => parsePublishArgs([]), /Falta --file/);
  assert.throws(
    () =>
      parsePublishArgs([
        "--file", "a.tif",
        "--layer", "aptitud",
        "--name", "Aptitud",
        "--license", "Uso institucional",
        "--producer", "QGIS",
        "--method", "Overlay",
      ]),
    /--version/
  );
});

test("parsePublishArgs acepta una publicación válida", () => {
  const opts = parsePublishArgs([
    "--file", "a.tif",
    "--layer", "aptitud_jojoba",
    "--version", "2026-11",
    "--name", "Aptitud para jojoba",
    "--license", "Uso institucional",
    "--producer", "QGIS 3.40",
    "--method", "Weighted overlay",
    "--minzoom", "8",
    "--maxzoom", "13",
  ]);
  assert.equal(opts.layer, "aptitud_jojoba");
  assert.equal(opts.version, "2026-11");
  assert.equal(opts.format, "webp");
  assert.equal(opts.maxTiles, 20000);
});

test("parsePublishArgs rechaza formato y zoom inválidos", () => {
  const base = [
    "--file", "a.tif",
    "--layer", "aptitud",
    "--version", "2026-11",
    "--name", "Aptitud",
    "--license", "Uso",
    "--producer", "QGIS",
    "--method", "Overlay",
  ];
  assert.throws(() => parsePublishArgs([...base, "--format", "gif"]), /webp o png/);
  assert.throws(() => parsePublishArgs([...base, "--resampling", "foo"]), /--resampling/);
  assert.throws(() => parsePublishArgs([...base, "--minzoom", "14", "--maxzoom", "13"]), /--maxzoom/);
});

test("parseSyncArgs por defecto regenera el índice", () => {
  const opts = parseSyncArgs([]);
  assert.equal(opts.index, true);
  assert.equal(opts.keep, 2);
  assert.equal(opts.pruneSources, false);
});

test("parseStatsCsv valida columnas, números y duplicados", () => {
  const header =
    "admin_level,admin_code,admin_name,class_id,class_label,class_min,class_max,hectares,mean,min,max,p10,p90\n";
  const row = "comuna,03101,Copiapó,-1,,0,1,12345.6,0.62,0.01,1,0.31,0.88\n";
  const rows = parseStatsCsv(header + row, { layerId: "aptitud", version: "2026-11" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].layer_id, "aptitud");
  assert.equal(rows[0].admin_level, "comuna");
  assert.equal(rows[0].class_id, -1);
  assert.equal(rows[0].hectares, 12345.6);

  assert.throws(
    () => parseStatsCsv("admin_level,admin_code\ncomuna,03101\n", {}),
    /Falta la columna/
  );
  assert.throws(
    () => parseStatsCsv(header + row + row, { layerId: "aptitud", version: "2026-11" }),
    /duplicada/
  );
  assert.throws(
    () =>
      parseStatsCsv(
        header + "barrio,03101,Copiapó,-1,,0,1,1,0,0,1,0,1\n",
        { layerId: "aptitud", version: "2026-11" }
      ),
    /admin_level inválido/
  );
});

test("parseGdalInfo normaliza EPSG:4326", () => {
  const info = {
    size: [1000, 500],
    coordinateSystem: { wkt: 'GEOGCRS["WGS 84",ID["EPSG",4326]]' },
    geoTransform: [-71.5, 0.01, 0, -25, 0, -0.01],
    cornerCoordinates: {
      upperLeft: [-71.5, -25],
      lowerLeft: [-71.5, -30],
      lowerRight: [-61.5, -30],
      upperRight: [-61.5, -25],
    },
    bands: [{ type: "Float32", noDataValue: -9999, minimum: 0, maximum: 1 }],
  };
  const meta = parseGdalInfo(info);
  assert.equal(meta.crs, "EPSG:4326");
  assert.deepEqual(meta.bbox, [-71.5, -30, -61.5, -25]);
  assert.equal(meta.values.min, 0);
  assert.equal(meta.values.max, 1);
  assert.equal(meta.nodata, -9999);
  assert.ok(meta.resolution_m > 0);
});

test("parseGdalInfo rechaza un CRS no soportado", () => {
  assert.throws(
    () =>
      parseGdalInfo({
        size: [10, 10],
        coordinateSystem: { wkt: 'PROJCRS["UTM 19S",ID["EPSG",32719]]' },
        cornerCoordinates: {},
        bands: [{}],
      }),
    /CRS no soportado/
  );
});

test("estimateTileCount cubre el bbox y los zooms", () => {
  const result = estimateTileCount([-71.5, -30, -61.5, -25], 8, 9);
  assert.ok(result.total > 0);
  assert.ok(result.zooms[9] > result.zooms[8]);
});

test("normalizeLegend acepta gradiente y clases", () => {
  const gradient = normalizeLegend(
    { type: "gradient", stops: [{ value: 0, color: "#000" }, { value: 1, color: "#fff" }] },
    0,
    1
  );
  assert.equal(gradient.type, "gradient");

  const classes = normalizeLegend(
    {
      type: "classes",
      classes: [{ min: 0, max: 0.5, label: "Baja", color: "#f00" }],
    },
    0,
    1
  );
  assert.equal(classes.classes[0].id, 0);

  assert.throws(() => normalizeLegend({ type: "otro" }, 0, 1), /gradient.*classes/);
  assert.equal(defaultLegend(0, 1).type, "gradient");
});

test("buildRasterManifest calcula conteo, bytes y checksum", () => {
  const base = {
    layer_id: "aptitud",
    version: "1",
    bbox: [-71, -30, -70, -29],
    tiles: { format: "webp", minzoom: 8, maxzoom: 9 },
  };
  const manifest = buildRasterManifest(base, [
    { rel: "9/1/2.webp", bytes: 30 },
    { rel: "8/0/1.webp", bytes: 10 },
  ]);
  assert.equal(manifest.tiles.count, 2);
  assert.equal(manifest.tiles.bytes, 40);
  assert.match(manifest.tiles.checksum, /^[a-f0-9]{64}$/);
});

test("buildRasterIndex ordena capas y versiones", () => {
  const index = buildRasterIndex([
    {
      layer_id: "b",
      layer_slug: "b",
      active_version: "2",
      versions: [
        {
          version: "2",
          manifest: {
            tile_url_template: "/raster/b/2/{z}/{x}/{y}.webp",
            tiles: { count: 2, bytes: 20, minzoom: 8, maxzoom: 9, checksum: "x" },
            bbox: [0, 0, 1, 1],
            generated_at: "2026-01-02",
          },
        },
      ],
    },
    {
      layer_id: "a",
      layer_slug: "a",
      active_version: "1",
      versions: [
        {
          version: "1",
          manifest: {
            tile_url_template: "/raster/a/1/{z}/{x}/{y}.webp",
            tiles: { count: 1, bytes: 10, minzoom: 8, maxzoom: 9, checksum: "y" },
            bbox: [0, 0, 1, 1],
            generated_at: "2026-01-01",
          },
        },
      ],
    },
  ]);
  assert.deepEqual(index.layers.map((layer) => layer.layer_id), ["a", "b"]);
  assert.equal(index.layers[1].versions[0].url_template, "/raster/b/2/{z}/{x}/{y}.webp");
});

test("configValidator acepta ráster solo con urlTemplate y manifest", () => {
  const tema = (raster) => ({
    clima: {
      capas: ["aptitud_jojoba"],
      estilo: {
        aptitud_jojoba: {
          tipo: "raster",
          source: { type: "raster", raster },
        },
      },
    },
  });

  assert.equal(
    validarConfiguracionGlobal(
      tema({
        urlTemplate: "/raster/aptitud_jojoba/1/{z}/{x}/{y}.webp",
        manifest: "/raster/aptitud_jojoba/1/manifest.json",
      })
    ).errores,
    0
  );
  assert.ok(
    validarConfiguracionGlobal(
      tema({ urlTemplate: "/raster/aptitud_jojoba/1/{z}/{x}/{y}.webp" })
    ).errores > 0
  );
});

test("verifyVersion detecta tiles alterados", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "woll-raster-"));
  try {
    await mkdir(path.join(root, "8", "0"), { recursive: true });
    await writeFile(path.join(root, "8", "0", "1.webp"), Buffer.from("abc"));
    const base = {
      layer_id: "aptitud",
      version: "1",
      bbox: [-71, -30, -70, -29],
      tiles: { format: "webp", minzoom: 8, maxzoom: 8 },
    };
    const manifest = buildRasterManifest(base, [{ rel: "8/0/1.webp", bytes: 3 }]);
    assert.deepEqual(await verifyVersion(root, manifest), []);

    await writeFile(path.join(root, "8", "0", "1.webp"), Buffer.from("abcd"));
    const errors = await verifyVersion(root, manifest);
    assert.ok(errors.some((error) => error.includes("bytes")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
