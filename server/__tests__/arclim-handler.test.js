import { test } from "node:test";
import assert from "node:assert/strict";

import { handleArclimGeoJSON } from "../handlers/arclim.js";

test("arclim exige indicator", async () => {
  const result = await handleArclimGeoJSON({});
  assert.equal(result.status, 400);
});

test("arclim filtra las comunas de Atacama", async () => {
  let calledUrl = "";
  const fetchImpl = async (url) => {
    calledUrl = url;
    return {
      ok: true,
      json: async () => ({
        data: {
          features: [
            { properties: { arclim_id: "3101", NOM_COMUNA: "Copiapó" } },
            { properties: { arclim_id: "1301", NOM_COMUNA: "Santiago" } },
          ],
        },
      }),
    };
  };

  const result = await handleArclimGeoJSON(
    { indicator: "temp", seasons: "annual" },
    { fetchImpl }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.type, "FeatureCollection");
  assert.equal(result.body.features.length, 1);
  assert.equal(result.body.features[0].properties.NOM_COMUNA, "Copiapó");
  assert.match(calledUrl, /attributes=NOM_COMUNA/);
});

test("arclim devuelve 500 si el upstream falla", async () => {
  const fetchImpl = async () => ({ ok: false, status: 502 });

  const result = await handleArclimGeoJSON(
    { indicator: "temp" },
    { fetchImpl }
  );

  assert.equal(result.status, 500);
  assert.match(result.body.error, /HTTP 502/);
});
