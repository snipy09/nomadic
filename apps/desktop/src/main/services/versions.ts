// Semantic version comparison with pre-release support (1.2.0-beta.3 < 1.2.0).

interface Parsed {
  core: [number, number, number];
  pre: string[];
}

function parse(v: string): Parsed | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v.trim());
  if (!m) return null;
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] };
}

export function isValidVersion(v: string): boolean {
  return parse(v) !== null;
}

/** -1, 0 or 1 like a comparator. Invalid versions throw. */
export function compareVersions(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) throw new Error(`Invalid version: ${!pa ? a : b}`);
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] < pb.core[i] ? -1 : 1;
  }
  if (!pa.pre.length || !pb.pre.length) return pa.pre.length === pb.pre.length ? 0 : pa.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x) ? Number(x) : NaN;
    const ny = /^\d+$/.test(y) ? Number(y) : NaN;
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx < ny ? -1 : 1;
    } else if (Number.isNaN(nx) !== Number.isNaN(ny)) {
      return Number.isNaN(nx) ? 1 : -1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}
