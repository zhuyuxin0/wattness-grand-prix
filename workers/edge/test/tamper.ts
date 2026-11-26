/**
 * One changed digit: the last digit of the battery's energy_kwh, plus one. The golden file's tampered
 * case and the tests apply this same change, so the Worker and the repository verifier judge the same bytes.
 */
export function changeOneDigit(text: string): string {
  const m = /"energy_kwh": (\d+)/.exec(text);
  if (!m || m[1] === undefined) throw new Error("no energy_kwh to change");
  const digits = m[1];
  const changed = `${digits.slice(0, -1)}${(Number(digits.slice(-1)) + 1) % 10}`;
  return `${text.slice(0, m.index)}"energy_kwh": ${changed}${text.slice(m.index + m[0].length)}`;
}

export const ONE_DIGIT = "battery.energy_kwh, its last digit plus one";
