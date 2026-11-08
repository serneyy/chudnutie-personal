// FORMA family cloud JSON adapter. Dedicated Cloudflare Worker; no GitHub token in the browser.
// GitHub token must be configured once as Worker secret GITHUB_TOKEN.
// App: https://serneyy.github.io/chudnutie-personal/
const REPO = 'serneyy/chudnutie-personal';
const FILE = 'data/forma-family.json';
const ORIGIN = 'https://serneyy.github.io';
const API = 'https://api.github.com/repos/' + REPO + '/contents/' + FILE;
const MAX_BYTES = 250000;
const isValidDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const response = (body, status = 200, origin = ORIGIN) => new Response(JSON.stringify(body), {
  status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff'
  }
});
function validate(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.profiles) || payload.profiles.length > 25)
    throw new Error('Invalid profiles document');
  const ids = new Set();
  for (const p of payload.profiles) {
    if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 100 ||
        typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100 ||
        !p.data || !Array.isArray(p.data.foods) || !Array.isArray(p.data.weights) ||
        !Array.isArray(p.data.workouts) || !p.data.profile || ids.has(p.id))
      throw new Error('Invalid or duplicate profile');
    ids.add(p.id);
  }
  return {version: 1, profiles: payload.profiles};
}
function mergeProfiles(remote, local) {
  const combined = new Map(remote.profiles.map(p => [p.id, p]));
  for (const p of local.profiles) {
    const prior = combined.get(p.id);
    if (!prior || isValidDate(p.updatedAt) &&
        (!isValidDate(prior.updatedAt) || Date.parse(p.updatedAt) > Date.parse(prior.updatedAt))) {
      combined.set(p.id, p);
    }
  }
  return validate({version: 1, profiles: [...combined.values()]});
}
function encodeUtf8(value) {
  const bytes = new TextEncoder().encode(value);
  let str = '';
  for (let i = 0; i < bytes.length; i += 8192)
    str += String.fromCharCode(...bytes.slice(i, i + 8192));
  return btoa(str);
}
function decodeUtf8(value) {
  const binary = atob(value.replace(/\s/g, ''));
  return new TextDecoder('utf-8', {fatal: true}).decode(
    Uint8Array.from(binary, c => c.charCodeAt(0))
  );
}
async function githubRead(token) {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'FORMA-Family-Sync'
  };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(API + '?t=' + Date.now(), {headers, cf: {cacheTtl: 0}});
  if (r.status === 404) return {document: {version: 1, profiles: []}, sha: null};
  if (!r.ok) throw new Error('GitHub GET failed with HTTP ' + r.status);
  const data = await r.json();
  return {document: validate(JSON.parse(decodeUtf8(data.content))), sha: data.sha};
}
async function githubWrite(token, doc, sha) {
  const r = await fetch(API, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'FORMA-Family-Sync'
    },
    body: JSON.stringify({
      message: 'data: autosave FORMA family profiles',
      content: encodeUtf8(JSON.stringify(doc, null, 2) + '\n'),
      ...(sha ? {sha} : {})
    })
  });
  if (r.status === 409 || r.status === 422) return false;
  if (!r.ok) throw new Error('GitHub PUT failed with HTTP ' + r.status);
  return true;
}
export default {
  async fetch(req, env) {
    const requestOrigin = req.headers.get('Origin') || '';
    const allowed = requestOrigin === ORIGIN || !requestOrigin;
    if (req.method === 'OPTIONS')
      return allowed ? response({ok: true}, 200) : response({error: 'Origin not allowed'}, 403);
    if (!allowed) return response({error: 'Origin not allowed'}, 403);
    const path = new URL(req.url).pathname;
    if (path === '/health' && req.method === 'GET')
      return response({ok: true, ready: Boolean(env.GITHUB_TOKEN), repository: REPO});
    if (path !== '/profiles' || !['GET', 'POST'].includes(req.method))
      return response({error: 'Not found'}, 404);
    try {
      if (req.method === 'GET') {
        const {document} = await githubRead(env.GITHUB_TOKEN);
        return response({ok: true, ...document});
      }
      if (!env.GITHUB_TOKEN)
        return response({error: 'GitHub write secret has not been configured yet'}, 503);
      const length = Number(req.headers.get('Content-Length') || 0);
      if (length > MAX_BYTES) return response({error: 'Payload too large'}, 413);
      const raw = await req.text();
      if (raw.length > MAX_BYTES) return response({error: 'Payload too large'}, 413);
      const incoming = validate(JSON.parse(raw));
      for (let attempt = 0; attempt < 4; attempt++) {
        const {document, sha} = await githubRead(env.GITHUB_TOKEN);
        const merged = mergeProfiles(document, incoming);
        if (JSON.stringify(merged) === JSON.stringify(document))
          return response({ok: true, saved: true, ...merged});
        if (await githubWrite(env.GITHUB_TOKEN, merged, sha))
          return response({ok: true, saved: true, ...merged});
      }
      return response({error: 'Concurrent update, retry'}, 409);
    } catch (e) {
      console.error(JSON.stringify({event: 'forma_sync_error', message: String(e.message || e)}));
      return response({error: 'GitHub synchronization temporarily unavailable'}, 502);
    }
  }
};
