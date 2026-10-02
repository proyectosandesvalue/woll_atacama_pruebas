import { logger } from "./logger.js";

/**
 * Validador de esquemas de configuración global.
 *
 * Verifica:
 *  - Que los grupos de cargaInicial existan en los grupos del tema.
 *  - Que las capas declaradas en cargaInicial.capas existan en estilo.
 *  - Que cada capa declarada tenga una entrada de estilo.
 *  - Que las capas GeoJSON tengan `url`.
 *  - Que las capas WMS tengan `servicio`.
 *  - Que el `type` sea uno de los valores soportados.
 *  - Que si hay `atributo`, existan `colores` o `iconos` para ese atributo.
 *  - Duplicados DENTRO de un mismo contenedor (capas duplicadas en la lista
 *    maestra, o duplicadas dentro de un mismo grupo).
 *
 * IMPORTANTE: en este proyecto la lista `capas` es el **índice maestro** del
 * tema, y `grupos.<x>.capas` reutiliza subconjuntos de esa lista. Por diseño,
 * una capa aparece en `capas` y en uno o más grupos. Eso NO es un error y
 * NO se avisa.
 *
 * @param {Object} allTemasConfig - Configuración global de todos los temas.
 * @returns {{ errores: number, advertencias: number }}
 */
export function validarConfiguracionGlobal(allTemasConfig) {
  logger.log("Iniciando validación estática de configuración...");

  const TIPOS_GEOJSON = new Set(["point", "line", "polygon", "heatmap"]);
  let errores = 0;
  let advertencias = 0;

  const err = (msg) => {
    logger.error(`[Validación Config] ${msg}`);
    errores++;
  };
  const warn = (msg) => {
    logger.warn(`[Validación Config] ${msg}`);
    advertencias++;
  };

  for (const [temaNombre, configTema] of Object.entries(allTemasConfig)) {
    // 1. Grupos declarados en cargaInicial
    if (
      configTema.cargaInicial &&
      Array.isArray(configTema.cargaInicial.grupos)
    ) {
      configTema.cargaInicial.grupos.forEach((grupoInicial) => {
        if (!configTema.grupos || !(grupoInicial in configTema.grupos)) {
          err(
            `Tema "${temaNombre}": el grupo de carga inicial "${grupoInicial}" no está definido.`
          );
        }
      });
    }

    // 2. Capas declaradas en cargaInicial.capas deben existir en estilo
    if (
      configTema.cargaInicial &&
      Array.isArray(configTema.cargaInicial.capas)
    ) {
      configTema.cargaInicial.capas.forEach((capaNombre) => {
        if (!configTema.estilo || !configTema.estilo[capaNombre]) {
          err(
            `Tema "${temaNombre}": la capa de carga inicial "${capaNombre}" no tiene entrada de estilo.`
          );
        }
      });
    }

    // 3. Recopilar capas declaradas para validar su estilo
    const capasDeclaradas = new Set();

    if (Array.isArray(configTema.capas)) {
      configTema.capas.forEach((capa) => capasDeclaradas.add(capa));
    }
    if (configTema.grupos && typeof configTema.grupos === "object") {
      Object.values(configTema.grupos).forEach((grupo) => {
        if (Array.isArray(grupo.capas)) {
          grupo.capas.forEach((capa) => capasDeclaradas.add(capa));
        }
      });
    }

    // 3b. Duplicados DENTRO del mismo contenedor (esto sí es un error de config)
    if (Array.isArray(configTema.capas)) {
      const vistos = new Set();
      configTema.capas.forEach((capa) => {
        if (vistos.has(capa)) {
          warn(
            `Tema "${temaNombre}": la capa "${capa}" está duplicada dentro de "capas".`
          );
        }
        vistos.add(capa);
      });
    }

    if (configTema.grupos && typeof configTema.grupos === "object") {
      Object.entries(configTema.grupos).forEach(([grupoKey, grupo]) => {
        if (!Array.isArray(grupo.capas)) return;
        const vistos = new Set();
        grupo.capas.forEach((capa) => {
          if (vistos.has(capa)) {
            warn(
              `Tema "${temaNombre}", grupo "${grupoKey}": la capa "${capa}" está duplicada dentro del grupo.`
            );
          }
          vistos.add(capa);
        });
      });
    }

    // 4. Validar cada capa declarada
    capasDeclaradas.forEach((capaNombre) => {
      const estilo = configTema.estilo?.[capaNombre];
      if (!estilo) {
        err(
          `Tema "${temaNombre}": la capa "${capaNombre}" no tiene entrada de estilo.`
        );
        return;
      }

      const esWMS =
        estilo.tipo === "wms" ||
        estilo.type === "wms" ||
        (estilo.servicio && !estilo.url);

      if (esWMS) {
        if (!estilo.servicio) {
          err(
            `Tema "${temaNombre}", capa "${capaNombre}": declarada como WMS pero sin 'servicio'.`
          );
        }
      } else {
        if (!estilo.url) {
          err(
            `Tema "${temaNombre}", capa "${capaNombre}": falta 'url' en la configuración.`
          );
        }
        if (estilo.type && !TIPOS_GEOJSON.has(estilo.type)) {
          err(
            `Tema "${temaNombre}", capa "${capaNombre}": 'type' inválido "${estilo.type}". Válidos: ${[...TIPOS_GEOJSON].join(", ")}.`
          );
        }
      }

      // 5. Coherencia atributo ↔ colores/iconos
      if (estilo.atributo) {
        const tieneColores =
          estilo.colores && Object.keys(estilo.colores).length > 0;
        const tieneIconos =
          estilo.iconos && Object.keys(estilo.iconos).length > 0;
        if (!tieneColores && !tieneIconos) {
          warn(
            `Tema "${temaNombre}", capa "${capaNombre}": define 'atributo' pero no tiene 'colores' ni 'iconos'.`
          );
        }
      }
    });
  }

  if (errores > 0) {
    logger.warn(
      `Validación de configuración: ${errores} errores, ${advertencias} advertencias. Revisa los logs.`
    );
  } else {
    logger.log(
      `Validación de configuración OK (${advertencias} advertencias).`
    );
  }

  return { errores, advertencias };
}