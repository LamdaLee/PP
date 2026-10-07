export function accountMatches(expected, current) {
  return !!expected.userId && expected.userId === current.userId && expected.generation === current.generation;
}
