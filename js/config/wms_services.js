import { PROXY_URL } from "./proxy.js";

/**
 * Servicio WMS de Copernicus Data Space Ecosystem.
 *
 * Todos comparten proxy, proyección, tamaño de tile y fecha. El INSTANCE_ID
 * vive solo en el servidor; aquí se declara únicamente la capa.
 * MAXCC=30 descarta escenas con más de 30% de nubosidad.
 */
function copernicus(layers, nombre) {
  return {
    url: `${PROXY_URL}?source=copernicus-wms&MAXCC=30`,
    layers,
    format: "image/png",
    transparent: true,
    version: "1.3.0",
    attribution: "Copernicus Data Space Ecosystem",
    nombre,
    info_format: "application/json",
    opacity: 0.8,
    maxNativeZoom: 16,
    keepBuffer: 1,
    tileSize: 512,
    updateWhenIdle: true,
    updateWhenZooming: false,
  };
}

const wmsConfig = {
  servicios: {
    ide_minagri: {
      url: "https://www.geoportal.cl/geoserver/Destinos_Turisticos/wms",
      layers: "Destinos_Turisticos:destinos_tursticos_2024",
      format: "image/png",
      transparent: true,
      version: "1.3.0",
      attribution: "IDE CHILE",
      nombre: "Destinos Turisticos 2024",
      info_format: "application/json", // formato preferido para GetFeatureInfo
      opacity: 0.8,
      popupCampos: ["NOMBRE", "TIPO", "REGION"],
      alias: { NOMBRE: "Nombre", TIPO: "Tipo", REGION: "Región" },
    },
    // Agrega más servicios WMS aquí
    ide_ciren_agroindustrias: {
      url: "https://esri.ciren.cl/server/services/IDEMINAGRI/CATASTRO_FRUTICOLA/MapServer/WMSServer",
      layers: "66",
      format: "image/png",
      transparent: true,
      version: "1.3.0",
      attribution: "CIREN / IDEMINAGRI",
      nombre: "Agroindustrias Atacama",
      info_format: "text/html", // formato preferido para GetFeatureInfo
      opacity: 0.8,
    },

    // ── Copernicus Data Space Ecosystem (vía /api/proxy) ──────────
    copernicus_ndvi: copernicus("NDVI", "NDVI (Sentinel-2)"),
    copernicus_evi: copernicus("EVI", "EVI (Sentinel-2)"),
    copernicus_evi2: copernicus("EVI2", "EVI2 (Sentinel-2)"),
    copernicus_gndvi: copernicus("GNDVI", "GNDVI (Sentinel-2)"),
    copernicus_savi: copernicus("SAVI", "SAVI (Sentinel-2)"),
    copernicus_msavi2: copernicus("MSAVI2", "MSAVI2 (Sentinel-2)"),
    copernicus_vari: copernicus("VARI", "VARI (Sentinel-2)"),
    copernicus_mcari: copernicus("MCARI", "MCARI (Sentinel-2)"),
    copernicus_psri: copernicus("PSRI", "PSRI (Sentinel-2)"),
    copernicus_ndyi: copernicus("NDYI", "NDYI (Sentinel-2)"),
    copernicus_ari_1: copernicus("ARI_1", "ARI_1 (Sentinel-2)"),
    copernicus_agricultura: copernicus("AGRICULTURE", "Agricultura (Sentinel-2)"),
    copernicus_true_color_s2l2a: copernicus("TRUE-COLOR-S2L2A", "Color real Sentinel-2 L2A"),
    copernicus_ndwi: copernicus("NDWI", "NDWI (Sentinel-2)"),
    copernicus_ndci: copernicus("NDCI", "NDCI (Sentinel-2)"),
    copernicus_wiw: copernicus("WIW", "WIW (Sentinel-2)"),
    copernicus_msi: copernicus("MSI", "MSI (Sentinel-2)"),
    copernicus_moisture_index: copernicus("MOISTURE-INDEX", "Índice de humedad (Sentinel-2)"),
    copernicus_mdmi: copernicus("MDMI", "MDMI (Sentinel-2)"),
    copernicus_swir: copernicus("SWIR", "SWIR (Sentinel-2)"),
  },
};

export default wmsConfig;
