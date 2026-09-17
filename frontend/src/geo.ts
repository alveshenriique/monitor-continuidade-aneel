import type { MalhaGeoJson } from './api/client';

type Ring = number[][];
type PolygonCoords = Ring[];
type MultiPolygonCoords = PolygonCoords[];

/**
 * Projeção equirretangular simples (sem dependências externas): x = lon, y = -lat,
 * escalada para o viewBox. Suficiente para um choropleth em escala de país — o
 * Brasil não cruza o antimeridiano nem se aproxima dos polos, onde essa projeção
 * distorce.
 */
export function criarProjecao(malha: MalhaGeoJson, largura: number, altura: number) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const visitarAnel = (anel: Ring) => {
    for (const [lon, lat] of anel) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  };

  for (const feature of malha.features) {
    const { geometry } = feature;
    if (geometry.type === 'Polygon') {
      (geometry.coordinates as PolygonCoords).forEach(visitarAnel);
    } else {
      (geometry.coordinates as MultiPolygonCoords).forEach((poligono) =>
        poligono.forEach(visitarAnel),
      );
    }
  }

  const margem = 0.02; // folga em graus para as bordas não colarem no viewBox
  minLon -= margem;
  maxLon += margem;
  minLat -= margem;
  maxLat += margem;

  const escala = Math.min(
    largura / (maxLon - minLon),
    altura / (maxLat - minLat),
  );
  const larguraProjetada = (maxLon - minLon) * escala;
  const alturaProjetada = (maxLat - minLat) * escala;
  const deslocX = (largura - larguraProjetada) / 2;
  const deslocY = (altura - alturaProjetada) / 2;

  return (lon: number, lat: number): [number, number] => [
    (lon - minLon) * escala + deslocX,
    (maxLat - lat) * escala + deslocY, // inverte Y: lat cresce para o norte, SVG para baixo
  ];
}

function anelParaPath(
  anel: Ring,
  projetar: (lon: number, lat: number) => [number, number],
): string {
  return anel
    .map(([lon, lat], i) => {
      const [x, y] = projetar(lon, lat);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ') + ' Z';
}

export function geometriaParaPath(
  geometry: MalhaGeoJson['features'][number]['geometry'],
  projetar: (lon: number, lat: number) => [number, number],
): string {
  if (geometry.type === 'Polygon') {
    return (geometry.coordinates as PolygonCoords)
      .map((anel) => anelParaPath(anel, projetar))
      .join(' ');
  }
  return (geometry.coordinates as MultiPolygonCoords)
    .map((poligono) => poligono.map((anel) => anelParaPath(anel, projetar)).join(' '))
    .join(' ');
}
