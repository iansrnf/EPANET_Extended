export const getCursorCoordinates = (
  longitude: number,
  latitude: number,
): { longitude: number; latitude: number } | null => {
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  )
    return null;

  let wrappedLongitude = longitude % 360;
  if (wrappedLongitude > 180) wrappedLongitude -= 360;
  if (wrappedLongitude < -180) wrappedLongitude += 360;

  return {
    longitude: roundCoordinate(wrappedLongitude),
    latitude: roundCoordinate(latitude),
  };
};

const roundCoordinate = (value: number): number => {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return rounded === 0 ? 0 : rounded;
};
