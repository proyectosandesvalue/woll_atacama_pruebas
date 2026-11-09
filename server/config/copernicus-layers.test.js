import { test } from "node:test";
import assert from "node:assert/strict";

import agricultura from "../../js/config/agricultura.js";
import clima from "../../js/config/clima.js";
import agua from "../../js/config/agua.js";
import mineria from "../../js/config/mineria.js";
import wmsConfig from "../../js/config/wms_services.js";

const DIMENSIONES = { agricultura, clima, agua, mineria };

// Capas satelitales nuevas: dimensión, clave de servicio y nombre WMS.
const NUEVAS = [
  ["agricultura", "copernicus_evi", "EVI"],
  ["agricultura", "copernicus_evi2", "EVI2"],
  ["agricultura", "copernicus_gndvi", "GNDVI"],
  ["agricultura", "copernicus_savi", "SAVI"],
  ["agricultura", "copernicus_msavi2", "MSAVI2"],
  ["agricultura", "copernicus_vari", "VARI"],
  ["agricultura", "copernicus_mcari", "MCARI"],
  ["agricultura", "copernicus_psri", "PSRI"],
  ["agricultura", "copernicus_ndyi", "NDYI"],
  ["agricultura", "copernicus_ari_1", "ARI_1"],
  ["clima", "copernicus_msi", "MSI"],
  ["clima", "copernicus_mdmi", "MDMI"],
  ["agua", "copernicus_ndwi", "NDWI"],
  ["agua", "copernicus_ndci", "NDCI"],
  ["agua", "copernicus_wiw", "WIW"],
  ["mineria", "copernicus_swir", "SWIR"],
];

function capasDeGrupos(config) {
  const ids = new Set();
  const recorrer = (grupos) => {
    for (const grupo of Object.values(grupos || {})) {
      for (const id of grupo.capas || []) ids.add(id);
      recorrer(grupo.subgrupos);
    }
  };
  recorrer(config.grupos);
  return ids;
}

test("cada capa Copernicus tiene ficha, leyenda y servicio", () => {
  for (const [dimension, config] of Object.entries(DIMENSIONES)) {
    const enGrupos = capasDeGrupos(config);

    for (const [id, capa] of Object.entries(config.estilo)) {
      if (capa.tipo !== "wms" || !String(capa.servicio).startsWith("copernicus_")) {
        continue;
      }

      assert.ok(config.capas.includes(id), `${dimension}/${id}: falta en capas`);
      assert.ok(enGrupos.has(id), `${dimension}/${id}: falta en algún grupo`);
      assert.ok(capa.nombrePersonalizado, `${dimension}/${id}: falta nombre`);
      assert.ok(capa.wmsDateSelector, `${dimension}/${id}: falta selector de fecha`);
      assert.ok(["DSS1", "DSS2"].includes(capa.wmsCollection), `${dimension}/${id}: colección inválida`);

      const ficha = capa.wmsFeatureInfo;
      assert.ok(ficha?.title, `${dimension}/${id}: falta title`);
      assert.ok(ficha?.description, `${dimension}/${id}: falta description`);
      assert.ok(ficha?.range && typeof ficha.range.text === "string", `${dimension}/${id}: falta range.text`);
      assert.ok(ficha?.bands?.out1, `${dimension}/${id}: faltan bandas`);
      assert.ok(ficha?.note, `${dimension}/${id}: falta note`);

      assert.ok(capa.wmsLegend, `${dimension}/${id}: falta wmsLegend`);

      const servicio = wmsConfig.servicios[capa.servicio];
      assert.ok(servicio, `${dimension}/${id}: servicio inexistente`);
      assert.ok(servicio.layers, `${dimension}/${id}: servicio sin layers`);
    }
  }
});

test("las capas nuevas apuntan al layer WMS correcto", () => {
  for (const [dimension, servicioId, wmsLayer] of NUEVAS) {
    const capa = DIMENSIONES[dimension].estilo[servicioId];
    assert.ok(capa, `${dimension}/${servicioId}: falta la capa`);

    const servicio = wmsConfig.servicios[servicioId];
    assert.ok(servicio, `${servicioId}: falta el servicio`);
    assert.equal(servicio.layers, wmsLayer, `${servicioId}: layer WMS incorrecto`);
  }
});
