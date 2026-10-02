/**
 * Web Worker para procesar capas GeoJSON en segundo plano
 * Evita que la interfaz se congele durante la carga y transformación de datos pesados.
 */

/**
 * Implementación de Spherical Mercator unproject (EPSG:3857 → EPSG:4326)
 *
 * Fórmula: https://epsg.io/3857 (WGS 84 / Pseudo-Mercator)
 *   lat = (2 * atan(e^(y/R)) - π/2) * 180/π
 *   lng = x * 180/π / R
 *
 * donde R = 6378137 (radio ecuatorial WGS84 en metros)
 *
 * @param {{x: number, y: number}} point - Coordenadas proyectadas en metros
 * @returns {{lat: number, lng: number}} Coordenadas geográficas en grados
 */
const R = 6378137;
const MAX_LATITUDE = 85.0511287798;

function unproject(point) {
    const d = 180 / Math.PI;
    return {
        lat: (2 * Math.atan(Math.exp(point.y / R)) - (Math.PI / 2)) * d,
        lng: point.x * d / R
    };
}

function transformCoordinates(data) {
    // Comprobar si el CRS es EPSG:3857
    const crs = data.crs && data.crs.properties && data.crs.properties.name;

    // Si no es 3857, devolver tal cual
    if (crs !== 'urn:ogc:def:crs:EPSG::3857' && crs !== 'EPSG:3857') {
        return data;
    }

    const transformedFeatures = data.features
        .filter(feature => feature?.geometry?.coordinates != null) // descartar geometrías nulas
        .map(feature => {
        // Clonar feature para no mutar original si fuera necesario (aunque en worker es copia)
        const newFeature = { ...feature, geometry: { ...feature.geometry } };
        if (!newFeature.geometry.coordinates) return newFeature;
        if (newFeature.geometry.type === 'Point') {
            const coords = newFeature.geometry.coordinates;
            const latlng = unproject({ x: coords[0], y: coords[1] });
            newFeature.geometry.coordinates = [latlng.lng, latlng.lat];
        }
        else if (newFeature.geometry.type === 'LineString' || newFeature.geometry.type === 'MultiLineString') {
            // Manejar ambos casos plana o anidada
            const isMulti = newFeature.geometry.type === 'MultiLineString';
            const processRing = (ring) => ring.map(coords => {
                const latlng = unproject({ x: coords[0], y: coords[1] });
                return [latlng.lng, latlng.lat];
            });

            if (isMulti) {
                newFeature.geometry.coordinates = newFeature.geometry.coordinates.map(processRing);
            } else {
                newFeature.geometry.coordinates = processRing(newFeature.geometry.coordinates);
            }
        }
        else if (newFeature.geometry.type === 'Polygon' || newFeature.geometry.type === 'MultiPolygon') {
            const isMulti = newFeature.geometry.type === 'MultiPolygon';
            const processPolygon = (poly) => poly.map(ring => ring.map(coords => {
                const latlng = unproject({ x: coords[0], y: coords[1] });
                return [latlng.lng, latlng.lat];
            }));
            if (isMulti) {
                newFeature.geometry.coordinates = newFeature.geometry.coordinates.map(processPolygon);
            } else {
                newFeature.geometry.coordinates = processPolygon(newFeature.geometry.coordinates);
            }
        }
        return newFeature;
    });

    return {
        ...data,
        features: transformedFeatures,
        crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::4326" } }
    };
}

self.onmessage = async function (e) {
    const { url, type } = e.data;
    if (type === 'FETCH_AND_PROCESS') {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            let data = await response.json();
            const processedData = transformCoordinates(data);
            self.postMessage({
                type: 'SUCCESS',
                data: processedData
            });

        } catch (error) {
            self.postMessage({
                type: 'ERROR',
                error: error.message
            });
        }
    }
};
