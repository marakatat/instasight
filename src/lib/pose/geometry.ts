export type Point = {
  x: number;
  y: number;
};

export function angle(
  a: Point,
  b: Point,
  c: Point
): number {
  const ab = {
    x: a.x - b.x,
    y: a.y - b.y,
  };

  const cb = {
    x: c.x - b.x,
    y: c.y - b.y,
  };

  const dot = ab.x * cb.x + ab.y * cb.y;
  const magnitude =
    Math.sqrt(ab.x ** 2 + ab.y ** 2) *
    Math.sqrt(cb.x ** 2 + cb.y ** 2);

  if (magnitude === 0) return 0;

  const radians = Math.acos(
    Math.min(1, Math.max(-1, dot / magnitude))
  );

  return Math.round((radians * 180) / Math.PI);
}
