/**
 * Validación de parámetros del proxy.
 *
 * No valida semántica geoespacial profunda (eso lo hace el servicio
 * upstream); valida forma, tamaño y límites para que el proxy no se
 * convierta en una vía de abuso.
 */

import { ProxyError } from "./errors.js";

// eslint-disable-next-line no-control-regex -- detectar caracteres de control es el propósito.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const WMS_FORMATS = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/tiff",
  "application/json",
  "application/x-esri-shape",
]);

const WFS_FORMATS = new Set([
  "application/json",
  "application/geo+json",
  "application/xml",
  "text/xml",
  "application/vnd.ogc.gml",
  "GML2",
  "GML3",
]);

const WMTS_FORMATS = new Set(["image/png", "image/jpeg", "image/webp", "image/tiff"]);

const WORLDVIEW_FORMATS = new Set(["image/jpeg", "image/png", "image/tiff", "image/kmz"]);

const INFO_FORMATS = new Set([
  "application/json",
  "application/xml",
  "text/xml",
  "text/plain",
  "application/vnd.ogc.gml",
]);

const TIME_RE = /^[0-9T:\-Z/.]{4,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function bad(code, message) {
  throw new ProxyError(code, message, { status: 400 });
}

function requireParam(params, name) {
  if (!params[name] || !String(params[name]).trim()) {
    bad("MISSING_PARAM", `Falta el parámetro '${name}'.`);
  }
}

function requireAny(params, names) {
  if (!names.some((name) => params[name] && String(params[name]).trim())) {
    bad("MISSING_PARAM", `Falta uno de estos parámetros: ${names.join(", ")}.`);
  }
}

function checkString(params, name, maxLength = 500) {
  if (params[name] === undefined) return;
  const value = String(params[name]);
  if (value.length > maxLength) bad("PARAM_TOO_LONG", `'${name}' supera ${maxLength} caracteres.`);
  if (CONTROL_CHARS.test(value)) bad("INVALID_PARAM", `'${name}' contiene caracteres de control.`);
}

function checkInt(params, name, min, max, required = false) {
  if (params[name] === undefined) {
    if (required) requireParam(params, name);
    return;
  }
  const value = Number(params[name]);
  if (!Number.isInteger(value) || value < min || value > max) {
    bad("INVALID_PARAM", `'${name}' debe ser un entero entre ${min} y ${max}.`);
  }
}

function checkBbox(params, required = true) {
  if (params.BBOX === undefined) {
    if (required) requireParam(params, "BBOX");
    return;
  }
  const parts = String(params.BBOX).split(",");
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(Number(p)))) {
    bad("INVALID_BBOX", "'BBOX' debe tener cuatro números separados por coma.");
  }
}

function checkTime(params, required = false) {
  if (params.TIME === undefined) {
    if (required) requireParam(params, "TIME");
    return;
  }
  if (!TIME_RE.test(String(params.TIME))) {
    bad("INVALID_TIME", "'TIME' no tiene un formato ISO8601 válido.");
  }
}

function checkDate(params, required = false) {
  if (params.TIME === undefined) {
    if (required) requireParam(params, "TIME");
    return;
  }
  if (!DATE_RE.test(String(params.TIME))) {
    bad("INVALID_TIME", "'TIME' debe ser una fecha YYYY-MM-DD.");
  }
}

function checkFormat(params, name, allowed, fallback) {
  if (params[name] === undefined && fallback) {
    params[name] = fallback;
    return;
  }
  if (params[name] === undefined) return;
  if (!allowed.has(String(params[name]))) {
    bad("INVALID_FORMAT", `'${name}' no está permitido.`);
  }
}

function checkEvalscript(params) {
  if (params.EVALSCRIPT === undefined) return;
  if (String(params.EVALSCRIPT).length > 20000) {
    bad("PARAM_TOO_LONG", "'EVALSCRIPT' supera 20000 caracteres.");
  }
}

function checkEvalscriptUrl(params) {
  if (params.EVALSCRIPTURL === undefined) return;
  const value = String(params.EVALSCRIPTURL);
  if (!/^https:\/\//i.test(value)) {
    bad("INVALID_PARAM", "'EVALSCRIPTURL' debe usar https://.");
  }
  if (value.length > 500) bad("PARAM_TOO_LONG", "'EVALSCRIPTURL' supera 500 caracteres.");
}

function validateWms(params) {
  const request = String(params.REQUEST || "").toUpperCase();
  if (!request) requireParam(params, "REQUEST");

  if (request === "GETCAPABILITIES") return;

  checkFormat(params, "FORMAT", WMS_FORMATS);
  checkTime(params);
  checkEvalscript(params);
  checkEvalscriptUrl(params);

  if (request === "GETMAP") {
    requireParam(params, "LAYERS");
    checkString(params, "LAYERS", 500);
    checkString(params, "STYLES", 500);
    checkString(params, "GEOMETRY", 10000);
    checkBbox(params, true);
    checkInt(params, "WIDTH", 1, 2048, true);
    checkInt(params, "HEIGHT", 1, 2048, true);
    if (!params.CRS && !params.SRS) {
      if (String(params.VERSION || "1.3.0") === "1.1.1") params.SRS = "EPSG:3857";
      else params.CRS = "EPSG:3857";
    }
    checkFormat(params, "FORMAT", WMS_FORMATS, "image/png");
    return;
  }

  if (request === "GETFEATUREINFO") {
    requireAny(params, ["QUERY_LAYERS", "LAYERS"]);
    checkString(params, "QUERY_LAYERS", 500);
    checkString(params, "LAYERS", 500);
    checkBbox(params, true);
    checkInt(params, "WIDTH", 1, 2048, true);
    checkInt(params, "HEIGHT", 1, 2048, true);
    checkFormat(params, "INFO_FORMAT", INFO_FORMATS, "application/json");
    if (params.I === undefined && params.X === undefined) {
      bad("MISSING_PARAM", "Falta 'I' (WMS 1.3.0) o 'X' (WMS 1.1.1).");
    }
    if (params.J === undefined && params.Y === undefined) {
      bad("MISSING_PARAM", "Falta 'J' (WMS 1.3.0) o 'Y' (WMS 1.1.1).");
    }
    checkInt(params, "I", 0, 2048);
    checkInt(params, "J", 0, 2048);
    checkInt(params, "X", 0, 2048);
    checkInt(params, "Y", 0, 2048);
    return;
  }

  bad("UNSUPPORTED_REQUEST", `REQUEST no soportado en WMS: ${request}.`);
}

function validateWfs(params) {
  const request = String(params.REQUEST || "").toUpperCase();
  if (!request) requireParam(params, "REQUEST");

  if (request === "GETCAPABILITIES") return;

  if (request === "DESCRIBEFEATURETYPE") {
    requireAny(params, ["TYPENAMES", "TYPENAME"]);
    checkString(params, "TYPENAMES", 500);
    checkString(params, "TYPENAME", 500);
    return;
  }

  if (request !== "GETFEATURE") {
    bad("UNSUPPORTED_REQUEST", `REQUEST no soportado en WFS: ${request}.`);
  }

  requireAny(params, ["TYPENAMES", "TYPENAME"]);
  checkString(params, "TYPENAMES", 500);
  checkString(params, "TYPENAME", 500);
  checkString(params, "FILTER", 8000);
  checkString(params, "CQL_FILTER", 4000);
  checkBbox(params, false);
  checkTime(params);
  checkInt(params, "MAXFEATURES", 1, 100);
  checkInt(params, "FEATURE_OFFSET", 0, 100000);
  checkFormat(params, "OUTPUTFORMAT", WFS_FORMATS, "application/json");
}

function validateWmts(params) {
  const request = String(params.REQUEST || "").toUpperCase();
  if (!request) requireParam(params, "REQUEST");

  if (request === "GETCAPABILITIES") return;
  if (request !== "GETTILE") {
    bad("UNSUPPORTED_REQUEST", `REQUEST no soportado en WMTS: ${request}.`);
  }

  for (const name of ["LAYER", "TILEMATRIXSET", "TILEMATRIX", "TILEROW", "TILECOL"]) {
    requireParam(params, name);
  }
  checkString(params, "LAYER", 200);
  checkString(params, "TILEMATRIXSET", 100);
  checkInt(params, "TILEMATRIX", 0, 30, true);
  checkInt(params, "TILEROW", 0, 1_000_000, true);
  checkInt(params, "TILECOL", 0, 1_000_000, true);
  checkFormat(params, "FORMAT", WMTS_FORMATS, "image/png");
  checkTime(params);
}

function validateWorldview(params) {
  const request = String(params.REQUEST || "GetSnapshot").toUpperCase();
  if (request !== "GETSNAPSHOT") {
    bad("UNSUPPORTED_REQUEST", `REQUEST no soportado en Worldview: ${request}.`);
  }

  requireParam(params, "LAYERS");
  requireParam(params, "BBOX");
  checkString(params, "LAYERS", 500);
  checkBbox(params, true);
  checkInt(params, "WIDTH", 1, 2048, true);
  checkInt(params, "HEIGHT", 1, 2048, true);
  checkDate(params, true);
  checkFormat(params, "FORMAT", WORLDVIEW_FORMATS, "image/jpeg");

  const crs = String(params.CRS || "EPSG:4326").toUpperCase();
  if (!["EPSG:4326", "EPSG:3857", "EPSG:3413", "EPSG:3031"].includes(crs)) {
    bad("INVALID_PARAM", `CRS no soportado en Worldview: ${crs}.`);
  }
  params.CRS = crs;

  if (params.RESOLUTION !== undefined && !/^\d{1,3}(m|km)$/i.test(String(params.RESOLUTION))) {
    bad("INVALID_PARAM", "'RESOLUTION' debe tener el formato 250m, 1km, etc.");
  }
  checkInt(params, "PADDING", 0, 100);
}

/**
 * Valida y normaliza los parámetros de un servicio.
 *
 * @param {"wms"|"wfs"|"wmts"|"worldview"} kind
 * @param {Record<string, string>} params
 */
export function validateRequest(kind, params) {
  if (kind === "wms") return validateWms(params);
  if (kind === "wfs") return validateWfs(params);
  if (kind === "wmts") return validateWmts(params);
  if (kind === "worldview") return validateWorldview(params);
  throw new ProxyError("UNKNOWN_VALIDATOR", `Validador desconocido: ${kind}.`, { status: 500 });
}

export { CONTROL_CHARS };
