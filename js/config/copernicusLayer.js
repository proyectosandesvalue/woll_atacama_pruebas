/**
 * Ficha común de las capas WMS de Copernicus Data Space Ecosystem.
 *
 * Centraliza los campos que comparten todas las capas satelitales:
 * fecha, nubosidad, bandas RGB y la nota que explica que el panel
 * muestra color, no el valor numérico del índice.
 */

const DEFAULT_BANDS = Object.freeze({
  out1: "Rojo",
  out2: "Verde",
  out3: "Azul",
  out4: "Máscara",
});

export const COPERNICUS_RGB_NOTE =
  "El mapa usa colores para representar el índice. Rojo, Verde y Azul son las partes del color del píxel, no el valor del índice. Para obtener un número único se necesita una capa que entregue solo el valor del índice.";

/**
 * Crea la configuración de una capa WMS de Copernicus.
 *
 * @param {object} options
 * @param {string} options.servicio Clave del servicio en `wms_services.js`.
 * @param {string} options.nombre Nombre visible en la lista de capas.
 * @param {string} options.title Título del panel de información.
 * @param {string} options.description Descripción para no especialistas.
 * @param {{min?: number, max?: number, text: string}} options.range
 * @param {object} options.legend Leyenda WMS (`gradient`, `note` o `items`).
 * @param {string} [options.note] Nota del panel; por defecto, la nota RGB.
 * @param {"DSS1"|"DSS2"} [options.collection] Colección para el selector de fecha.
 * @param {number} [options.maxcc] Nubosidad máxima aceptada.
 * @param {number} [options.dateRangeDays] Días hacia atrás en el selector.
 * @param {string} [options.historyStart] Fecha mínima del archivo histórico.
 */
export function copernicusLayer({
  servicio,
  nombre,
  title,
  description,
  range,
  legend,
  note = COPERNICUS_RGB_NOTE,
  collection = "DSS1",
  maxcc = 30,
  dateRangeDays = 180,
  historyStart = "2017-01-01",
}) {
  return {
    tipo: "wms",
    servicio,
    nombrePersonalizado: nombre,
    opacity: 0.8,
    wmsDateSelector: true,
    wmsCollection: collection,
    wmsMaxcc: maxcc,
    wmsDateRangeDays: dateRangeDays,
    wmsHistoryStart: historyStart,
    wmsFeatureInfo: {
      kind: "rgb",
      title,
      description,
      range,
      bands: { ...DEFAULT_BANDS },
      note,
    },
    wmsLegend: legend,
  };
}
