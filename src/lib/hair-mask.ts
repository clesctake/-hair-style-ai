// Editable, image-relative selection. A hand-traced demo mask is not an AI segmentation result.
export type MaskPoint = { x: number; y: number };
export type MaskStroke = { operation: 'add' | 'erase'; diameter: number; points: MaskPoint[] };
export type HairMask = {
  version: 'hair-mask-v1'; referencePhotoId: string; origin: 'manual' | 'demo_hand_traced';
  polygons: MaskPoint[][]; strokes: MaskStroke[]; feather: number;
};
export const emptyHairMask = (referencePhotoId: string): HairMask => ({
  version: 'hair-mask-v1', referencePhotoId, origin: 'manual', polygons: [], strokes: [], feather: .006,
});
export function demoHairMask(referencePhotoId: string): HairMask {
  // Conservative outline of dense hair in fictional-target.jpg, excluding face, neck and blouse.
  const outline = [[179,34],[231,27],[261,36],[288,53],[315,83],[332,124],[343,171],[353,214],
    [361,258],[359,297],[351,320],[361,329],[339,341],[309,342],[296,331],[297,310],
    [303,276],[307,247],[315,221],[319,204],[307,185],[296,170],[277,153],[262,135],
    [243,119],[224,102],[208,85],[192,85],[179,94],[164,116],[151,143],[146,169],
    [144,189],[149,217],[161,246],[180,266],[201,284],[208,305],[220,329],[206,338],
    [185,340],[166,332],[149,326],[132,318],[128,297],[117,272],[115,241],[117,215],
    [124,182],[125,154],[132,126],[143,93],[159,62]];
  return { ...emptyHairMask(referencePhotoId), origin: 'demo_hand_traced', polygons: [outline.map(([x, y]) => ({ x: x / 448, y: y / 560 }))] };
}
export function validateHairMask(mask: HairMask, referencePhotoId: string) {
  const point = (p: MaskPoint) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  if (!mask || mask.version !== 'hair-mask-v1' || mask.referencePhotoId !== referencePhotoId ||
      !['manual', 'demo_hand_traced'].includes(mask.origin) || !Number.isFinite(mask.feather) || mask.feather < 0 || mask.feather > .02 ||
      !Array.isArray(mask.polygons) || mask.polygons.length > 16 || !Array.isArray(mask.strokes) || mask.strokes.length > 512 ||
      mask.polygons.some(p => !Array.isArray(p) || p.length < 3 || p.length > 2048 || !p.every(point)) ||
      mask.strokes.some(s => !s || !['add', 'erase'].includes(s.operation) || !Number.isFinite(s.diameter) || s.diameter < .005 || s.diameter > .3 ||
        !Array.isArray(s.points) || s.points.length < 1 || s.points.length > 2048 || !s.points.every(point)) ||
      mask.strokes.reduce((n, s) => n + s.points.length, 0) > 50000) throw new Error('髪の選択範囲を確認してください。');
}
export const maskHasSelection = (mask: HairMask | undefined) => Boolean(mask && (mask.polygons.length || mask.strokes.some(s => s.operation === 'add')));

// Rasterize vectors at preview resolution; feather strictly inward so unselected pixels never change.
export function rasterizeHairMask(mask: HairMask, width: number, height: number): Uint8Array {
  validateHairMask(mask, mask.referencePhotoId);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 1048576) throw new Error('髪の範囲の画像サイズが不正です。');
  const binary = new Uint8Array(width * height);
  for (const polygon of mask.polygons) {
    for (let y = 0; y < height; y++) {
      const intersections: number[] = [], row = (y + .5) / height;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i], b = polygon[j];
        if ((a.y > row) !== (b.y > row)) intersections.push((a.x + (row - a.y) / (b.y - a.y) * (b.x - a.x)) * width);
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const left = Math.max(0, Math.ceil(intersections[i] - .5)), right = Math.min(width - 1, Math.floor(intersections[i + 1] - .5));
        for (let x = left; x <= right; x++) binary[y * width + x] = 1;
      }
    }
  }
  for (const stroke of mask.strokes) {
    const radius = stroke.diameter * Math.min(width, height) / 2;
    for (let i = 0; i < stroke.points.length; i++) {
      const a = stroke.points[Math.max(0, i - 1)], b = stroke.points[i];
      const ax = a.x * width, ay = a.y * height, bx = b.x * width, by = b.y * height;
      const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
      for (let y = Math.max(0, Math.floor(Math.min(ay, by) - radius)); y <= Math.min(height - 1, Math.ceil(Math.max(ay, by) + radius)); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - radius)); x <= Math.min(width - 1, Math.ceil(Math.max(ax, bx) + radius)); x++) {
          const t = length2 ? Math.max(0, Math.min(1, ((x + .5 - ax) * dx + (y + .5 - ay) * dy) / length2)) : 0;
          if ((x + .5 - ax - t * dx) ** 2 + (y + .5 - ay - t * dy) ** 2 <= radius ** 2) binary[y * width + x] = stroke.operation === 'add' ? 1 : 0;
        }
      }
    }
  }
  const weights = new Uint8Array(binary.length), feather = mask.feather * Math.min(width, height);
  if (feather < 1) { for (let i = 0; i < binary.length; i++) weights[i] = binary[i] * 255; return weights; }
  const distance = new Float32Array(binary.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x;
    distance[p] = binary[p] ? Math.min(x ? distance[p - 1] + 1 : 1, y ? distance[p - width] + 1 : 1) : 0;
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const p = y * width + x;
    if (binary[p]) distance[p] = Math.min(distance[p], x + 1 < width ? distance[p + 1] + 1 : 1, y + 1 < height ? distance[p + width] + 1 : 1);
    weights[p] = Math.round(255 * Math.min(1, distance[p] / feather));
  }
  return weights;
}
