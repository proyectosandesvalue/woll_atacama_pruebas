const capasBaseConfig = {
    // Puedes agregar más capas base aquí
    openStreetMap: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        nombre: 'OpenStreetMap'
    },
    googleMaps: {
        url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        nombre: 'Google Maps'
    },
    openTopoMap: {
        url: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
        nombre: 'OpenTopoMap'
    }
};

export default capasBaseConfig;