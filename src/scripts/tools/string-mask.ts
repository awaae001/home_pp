export function maskString(
  source: string,
  keep: number,
  count: number,
  symbol: "*" | "X",
  preserveSymbols: boolean,
): string {
  if (!Number.isInteger(keep) || keep < 0 || keep > 100000 ||
      !Number.isInteger(count) || count < 0 || count > 1000) {
    throw new RangeError("Invalid mask length");
  }
  const characters = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(source),
    ({ segment }) => segment,
  );
  const output = characters.slice(0, keep);
  let masked = 0;
  for (const character of characters.slice(keep)) {
    // A positive count caps the masked suffix; zero keeps the full structure.
    if (count > 0 && masked >= count) break;
    if (preserveSymbols && !/[A-Za-z0-9]/.test(character)) {
      output.push(character);
    } else {
      output.push(symbol);
      masked++;
    }
  }
  return output.join("");
}
