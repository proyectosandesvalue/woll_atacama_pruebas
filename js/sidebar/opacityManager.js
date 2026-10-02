import { createContextLogger } from '../utils/logger.js';

const log = createContextLogger('OpacityManager');

export function saveLayerOpacity(capaNombre, opacity) {
  try {
    const savedOpacities = JSON.parse(localStorage.getItem('layer-opacities') || '{}');
    savedOpacities[capaNombre] = opacity;
    localStorage.setItem('layer-opacities', JSON.stringify(savedOpacities));
  } catch (e) {
    log.warn('No se pudo guardar opacidad en localStorage:', e);
  }
}

export function getLayerOpacity(capaNombre) {
  try {
    const savedOpacities = JSON.parse(localStorage.getItem('layer-opacities') || '{}');
    const raw = savedOpacities[capaNombre];
    const parsed = Number(raw);
    return (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) ? parsed : 100;
  } catch (e) {
    return 100;
  }
}