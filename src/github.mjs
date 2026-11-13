const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GraphQL client. Retries on rate limits and 5xx. Returns { data, errors }.
export function client(token) {
  async function raw(query, variables = {}, tries = 6) {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-readme-action' },
      body: JSON.stringify({ query, variables }),
    });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch {}
    const limited = [403, 429, 502, 503, 504].includes(res.status) || body?.errors?.some((e) => e.type === 'RATE_LIMITED');
    if (limited && tries > 0) {
      await sleep(Number(res.headers.get('retry-after') || 0) * 1000 || 5000);
      return raw(query, variables, tries - 1);
    }
    if (!res.ok || !body || (!body.data && body.errors)) throw new Error(`GraphQL HTTP ${res.status}: ${text.slice(0, 300)}`);
    return body;
  }

  async function gql(query, variables, tries) {
    const body = await raw(query, variables, tries);
    if (body.errors) throw new Error(`GraphQL: ${JSON.stringify(body.errors).slice(0, 300)}`);
    return body.data;
  }

  async function paginate(query, variables, pick) {
    const out = [];
    let after = null;
    do {
      const conn = pick(await gql(query, { ...variables, after }));
      out.push(...conn.nodes);
      after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    } while (after);
    return out;
  }

  return { raw, gql, paginate };
}

export const PAGE = 'pageInfo { hasNextPage endCursor }';
