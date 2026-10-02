import { appState, isLayerLoaded, getLayer } from "../store/appState.js";
import { logger } from "../utils/logger.js";
import { DOM_PREFIXES } from "../config/constants.js";
import allTemasConfig from "../config/allTemasConfig.js";
import { cargarCapaIndividual } from "../utils/layerUtils.js";
import { activarDimension } from "../sidebar/dimensionBuilder.js";

function waitForElement(selector, timeoutMs = 5000) {
  const existing = document.getElementById(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let timer = null;
    let observer = null;

    const cleanup = () => {
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
    };

    const found = (el) => {
      cleanup();
      resolve(el);
    };

    observer = new MutationObserver((_mutations, obs) => {
      const el = document.getElementById(selector);
      if (el) found(el);
    });

    const container = document.getElementById('sidebar-layers') || document.body;
    observer.observe(container, { childList: true, subtree: true });

    timer = setTimeout(() => {
      const el = document.getElementById(selector);
      found(el || null);
    }, timeoutMs);
  });
}

export async function activarCapaYDimension(capaName, temaName) {
    if (appState.activeTemaName !== temaName) {
        activarDimension(temaName);

        let waitTema = 0;
        while (appState.activeTemaName !== temaName && waitTema < 20) {
            await new Promise(r => setTimeout(r, 100));
            waitTema++;
        }
    }

    if (!isLayerLoaded(capaName)) {
        // Esperar a que el checkbox aparezca en el DOM usando MutationObserver
        const checkboxId = `${DOM_PREFIXES.LAYER_CHECKBOX}${capaName}`;
        const checkbox = await waitForElement(checkboxId, 5000);

        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));
        } else if (!isLayerLoaded(capaName)) {
            await cargarCapaIndividual(capaName, temaName, allTemasConfig);
        }

        let intentos = 0;
        while (!isLayerLoaded(capaName) && intentos < 20) {
            await new Promise(r => setTimeout(r, 200));
            intentos++;
        }
    }
}

export async function zoomToResult(result, map, showPopup = true) {
    if (!result || !map) return;
    if (result.isMetadata) {
        await activarCapaYDimension(result.capaName, result.tema);
        return;
    }

    let layerInstance = result.layer;

    if (!isLayerLoaded(result.capaName)) {
        logger.log(`[SearchControl] Activando capa: ${result.capaName}`);
        await activarCapaYDimension(result.capaName, result.tema);
        layerInstance = getLayer(result.capaName);
    }
    if (result.bounds) {
        map.fitBounds(result.bounds, { maxZoom: 16, padding: [50, 50] });
    } else if (result.center) {
        map.setView(result.center, 16);
    }

    if (showPopup && layerInstance) {
        if (layerInstance.eachLayer) {
            let found = null;
            layerInstance.eachLayer(l => {
                if (!found && l.feature?.properties) {
                    const propsA = l.feature.properties;
                    const propsB = result.properties;

                    if (propsA.OBJECTID === propsB.OBJECTID ||
                        propsA.id === propsB.id ||
                        propsA.NOMBRE === propsB.NOMBRE) {
                        found = l;
                    }
                }
            });

            if (found && found.openPopup) {
                found.openPopup();
            }
        } else if (layerInstance.openPopup) {
            layerInstance.openPopup();
        }
    }
}
