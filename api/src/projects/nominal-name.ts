const NOMINAL_ID_PREFIX = "nominal:";
const VERSION_SUFFIX = /_v\d+$/;

export function nominalName(basename: string): string {
  let out = basename;
  while (VERSION_SUFFIX.test(out)) {
    out = out.replace(VERSION_SUFFIX, "");
  }
  return out === "" ? basename : out;
}

export function nominalId(name: string): string {
  return `${NOMINAL_ID_PREFIX}${name}`;
}

export function isNominalId(id: string): boolean {
  return id.startsWith(NOMINAL_ID_PREFIX);
}

export function nominalFromId(id: string): string | null {
  return isNominalId(id) ? id.slice(NOMINAL_ID_PREFIX.length) : null;
}