// Minimal Turso libSQL client over the HTTP pipeline API (v2).
// Zero dependencies — runs natively in Cloudflare Pages Functions.
//
// Required env bindings on the Pages project:
//   TURSO_DATABASE_URL  (libsql://<db>.turso.io or https://<db>.turso.io)
//   TURSO_AUTH_TOKEN

function baseUrl(env) {
  const raw = env.TURSO_DATABASE_URL || '';
  return raw.replace(/^libsql:\/\//, 'https://').replace(/\/$/, '');
}

function arg(value) {
  if (value === null || value === undefined) return { type: 'null' };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { type: 'integer', value: String(value) }
      : { type: 'float', value };
  }
  return { type: 'text', value: String(value) };
}

// Execute a batch of { sql, args } statements. Returns one result per
// statement: { cols: string[], rows: any[][] } with values decoded to JS.
export async function tursoExec(env, statements) {
  const res = await fetch(`${baseUrl(env)}/v2/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.TURSO_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        ...statements.map((s) => ({
          type: 'execute',
          stmt: { sql: s.sql, args: (s.args || []).map(arg) },
        })),
        { type: 'close' },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Turso HTTP ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();
  return body.results.slice(0, statements.length).map((r, i) => {
    if (r.type !== 'ok') {
      throw new Error(`Turso stmt ${i} failed: ${JSON.stringify(r.error)}`);
    }
    const result = r.response.result;
    const cols = result.cols.map((c) => c.name);
    const rows = result.rows.map((row) =>
      row.map((cell) => {
        if (cell.type === 'null') return null;
        if (cell.type === 'integer') return parseInt(cell.value, 10);
        if (cell.type === 'float') return cell.value;
        return cell.value;
      })
    );
    return { cols, rows };
  });
}

// Convenience: run one statement and get rows as plain objects.
export async function tursoQuery(env, sql, args = []) {
  const [result] = await tursoExec(env, [{ sql, args }]);
  return result.rows.map((row) =>
    Object.fromEntries(result.cols.map((c, i) => [c, row[i]]))
  );
}
