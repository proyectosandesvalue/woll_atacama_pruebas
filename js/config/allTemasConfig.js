// Configuracion Global de las Dimensiones

// Importa todos los archivos de configuracion de cada dimension
import aguaConfig from "./agua.js";
import climaConfig from "./clima.js";
import agriculturaConfig from "./agricultura.js";
import mineriaConfig from "./mineria.js";
import otrosConfig from "./otros.js";
import planificacionConfig from "./planificacion.js";
import riesgosConfig from "./riesgos.js";
import sueloConfig from "./suelo.js";
import energiaConfig from "./energia.js";

// Agrega aquí todas las configuraciones de tus temas con sus respectivos nombres
const allTemasConfig = {
  agua: aguaConfig,
  clima: climaConfig,
  agricultura: agriculturaConfig,
  mineria: mineriaConfig,
  otros: otrosConfig,
  planificacion: planificacionConfig,
  riesgos: riesgosConfig,
  suelo: sueloConfig,
  energia: energiaConfig,
};

export default allTemasConfig;
