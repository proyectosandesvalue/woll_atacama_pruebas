/**
 * Umbrales de la auditoría de calidad. VERSIONADOS: si cambia algo,
 * subir `version`; cada corrida guarda la versión con la que se clasificó.
 */

export const THRESHOLDS = Object.freeze({
  version: "v1",

  column: Object.freeze({
    mostlyCleanNullPct: 5,     // null% < 5  → mostly_clean
    mostlyCleanSuspPct: 1,     // susp% < 1  → mostly_clean
    hasNullsMaxPct: 30,        // null% <= 30 → has_nulls; > 30 → dirty
    dirtySuspPct: 5,           // susp% > 5  → dirty
    brokenNullPct: 70,         // null% > 70 → broken
    brokenSuspPct: 50,         // susp% > 50 → broken
    numericAsTextRatio: 0.8,
    categoricalMaxUnique: 30,
    idLikeRatio: 0.98,
    idLikeMinRows: 10,
  }),

  layer: Object.freeze({
    blockedBadGeomPct: 5,      // nulas + vacías + inválidas
    blockedZeroZeroPct: 50,
    warnDuplicateGeomPct: 5,
  }),

  provenance: Object.freeze({
    staleDays: 1095,           // 3 años
    minProvenanceFillPct: 50,
    // Se aplican sobre el nombre normalizado (minúsculas, sin tildes).
    provenanceColumnPattern: /origen/,
    dateColumnPattern: /(actualiz|fech_act|fecha corte)/,
  }),

  // bbox aproximado de la Región de Atacama [minLon, minLat, maxLon, maxLat].
  // Validar con QGIS antes de confiar en `outside_bbox`.
  atacamaBbox: Object.freeze([-72.0, -30.0, -66.5, -24.5]),

  /**
   * Excepciones por capa (layer_id):
   *   ignore_columns:  columnas que no se auditan.
   *   expected_sparse: columnas opcionales (los nulos no penalizan).
   */
  perLayer: Object.freeze({
    // ejemplo:
    // puntos_criticos_invierno_2024: { expected_sparse: ["f2_accione"] },
  }),
});