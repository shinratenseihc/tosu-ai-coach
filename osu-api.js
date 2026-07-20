// Client osu! API v2 en mode "client credentials".
// Aucun callback, aucune autorisation navigateur : l'utilisateur fournit
// l'identifiant et le secret de sa propre application OAuth osu!.
// Lecture de données publiques uniquement (profil, rank, pp).

const TOKEN_URL = 'https://osu.ppy.sh/oauth/token';
const API_BASE = 'https://osu.ppy.sh/api/v2';
const FETCH_TIMEOUT_MS = 10000;

let cachedToken = null;
let cachedTokenExpiry = 0;
let cachedTokenKey = '';

function timedFetch(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

async function getToken(clientId, clientSecret) {
  const key = `${clientId}`;
  if (cachedToken && cachedTokenKey === key && Date.now() < cachedTokenExpiry) return cachedToken;
  const response = await timedFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'public' }),
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'identifiants OAuth osu! refusés (vérifie l’ID et le secret)' : `osu! token HTTP ${response.status}`);
  const data = await response.json();
  if (!data.access_token) throw new Error('réponse OAuth osu! sans token');
  cachedToken = data.access_token;
  cachedTokenKey = key;
  cachedTokenExpiry = Date.now() + Math.max(60, Number(data.expires_in || 0) - 120) * 1000;
  return cachedToken;
}

function clearTokenCache() {
  cachedToken = null;
  cachedTokenExpiry = 0;
  cachedTokenKey = '';
}

async function fetchUser(clientId, clientSecret, username) {
  const token = await getToken(clientId, clientSecret);
  const response = await timedFetch(`${API_BASE}/users/@${encodeURIComponent(username)}/osu`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (response.status === 404) throw new Error(`utilisateur osu! « ${username} » introuvable`);
  if (response.status === 401) { clearTokenCache(); throw new Error('token osu! expiré ou révoqué, réessaie'); }
  if (!response.ok) throw new Error(`osu! API HTTP ${response.status}`);
  const user = await response.json();
  const stats = user.statistics || {};
  return {
    id: user.id,
    username: user.username,
    country: user.country_code || '',
    globalRank: stats.global_rank ?? null,
    countryRank: stats.country_rank ?? null,
    pp: stats.pp ?? null,
    accuracy: stats.hit_accuracy ?? null,
    playCount: stats.play_count ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getToken, fetchUser, clearTokenCache };
