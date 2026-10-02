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
      tiled: true,
    },
  },
};

export default wmsConfig;
