// Geometría de la marca de tres lomos, derivada de las razones del mockup
// "Marca en producto" (contenedor de 120 → ancho 24, gap 12, alturas 82/120/60,
// radius 6/3). `height` es el alto del lomo más alto (= alto del contenedor);
// todo lo demás escala proporcionalmente.
export type SpineGeom = {
  width: number;
  height: number;
  radiusTop: number;
  radiusBottom: number;
};

export type BrandMarkGeom = {
  gap: number;
  spines: [SpineGeom, SpineGeom, SpineGeom];
};

const WIDTH_RATIO = 24 / 120;
const GAP_RATIO = 12 / 120;
const RADIUS_TOP_RATIO = 6 / 24; // sobre el ancho del lomo
const RADIUS_BOTTOM_RATIO = 3 / 24;
const HEIGHT_RATIOS = [82 / 120, 120 / 120, 60 / 120] as const;

export function brandMarkGeom(height: number): BrandMarkGeom {
  const width = height * WIDTH_RATIO;
  const spine = (r: number): SpineGeom => ({
    width,
    height: height * r,
    radiusTop: width * RADIUS_TOP_RATIO,
    radiusBottom: width * RADIUS_BOTTOM_RATIO,
  });
  return {
    gap: height * GAP_RATIO,
    spines: [spine(HEIGHT_RATIOS[0]), spine(HEIGHT_RATIOS[1]), spine(HEIGHT_RATIOS[2])],
  };
}
