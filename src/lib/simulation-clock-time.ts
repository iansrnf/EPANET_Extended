export const setSimulationClockTime = (
  inp: string,
  startTimestamp: number,
): string => {
  const date = new Date(startTimestamp);
  if (!Number.isFinite(date.getTime()))
    throw new RangeError("Simulation start date and time must be valid.");

  const header = /^[ \t]*\[TIMES\][ \t]*(?:;[^\r\n]*)?(?:\r?\n|$)/im.exec(inp);
  if (!header)
    throw new Error("Simulation input is missing the TIMES section.");
  const bodyStart = header.index + header[0].length;
  const nextSectionPattern = /^[ \t]*\[/gm;
  nextSectionPattern.lastIndex = bodyStart;
  const sectionEnd = nextSectionPattern.exec(inp)?.index ?? inp.length;
  const newline = header[0].endsWith("\r\n") ? "\r\n" : "\n";
  const timing = inp
    .slice(bodyStart, sectionEnd)
    .replace(/^[ \t]*START[ \t]+CLOCKTIME\b[^\r\n]*(?:\r?\n|$)/gim, "");
  const clockTime = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  const headerNewline = header[0].endsWith("\n") ? "" : newline;
  return `${inp.slice(0, bodyStart)}${headerNewline}Start Clocktime\t${clockTime}${newline}${timing}${inp.slice(sectionEnd)}`;
};
