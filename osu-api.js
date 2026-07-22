// Client osu! API v2 en mode "client credentials".
// Aucun callback, aucune autorisation navigateur : l'utilisateur fournit
// l'identifiant et le secret de sa propre application OAuth osu!.
// Lecture de données publiques uniquement (profil, rank, pp, scores personnels).

const TOKEN_URL = 'https://osu.ppy.sh/oauth/token';
const API_BASE = 'https://osu.ppy.sh/api/v2';
const FETCH_TIMEOUT_MS = 10000;

let cachedToken = null;
let cachedTokenExpiry = 0;
let cachedTokenKey = '';
const mostPlayedCache = new Map();
const beatmapProfileCache = new Map();
const commentCache = new Map();
const MOST_PLAYED_CACHE_MS = 5 * 60 * 1000;

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

function normalizeScore(score) {
  const statistics = score.statistics || {};
  const mods = Array.isArray(score.mods)
    ? score.mods.map(mod => typeof mod === 'string' ? mod : mod.acronym).filter(Boolean).join('')
    : '';
  return {
    score: Number(score.total_score ?? score.legacy_total_score ?? score.score ?? 0),
    accuracy: Number(score.accuracy || 0) * (Number(score.accuracy || 0) <= 1 ? 100 : 1),
    combo: Number(score.max_combo || 0),
    misses: Number(statistics.miss ?? statistics.count_miss ?? 0),
    pp: Number(score.pp || 0),
    rank: score.rank || '',
    mods,
    endedAt: score.ended_at || score.created_at || null,
  };
}

async function fetchUserBeatmapScores(clientId, clientSecret, userId, beatmapId) {
  const token = await getToken(clientId, clientSecret);
  const url = `${API_BASE}/beatmaps/${encodeURIComponent(beatmapId)}/scores/users/${encodeURIComponent(userId)}/all?ruleset=osu`;
  const response = await timedFetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (response.status === 401) { clearTokenCache(); throw new Error('token osu! expiré ou révoqué, réessaie'); }
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`osu! scores HTTP ${response.status}`);
  const data = await response.json();
  return (Array.isArray(data) ? data : data.scores || []).map(normalizeScore).sort((a, b) => b.score - a.score);
}

async function fetchBeatmapFailProfile(clientId, clientSecret, beatmapId) {
  const cached = beatmapProfileCache.get(String(beatmapId));
  if (cached && Date.now() - cached.fetchedAt < MOST_PLAYED_CACHE_MS) return cached.value;
  const token = await getToken(clientId, clientSecret);
  const url = `${API_BASE}/beatmaps/${encodeURIComponent(beatmapId)}`;
  const response = await timedFetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (response.status === 401) { clearTokenCache(); throw new Error('token osu! expiré ou révoqué, réessaie'); }
  if (!response.ok) throw new Error(`osu! beatmap HTTP ${response.status}`);
  const fail = (await response.json()).failtimes?.fail;
  const value = Array.isArray(fail) && fail.length ? fail.map(Number) : null;
  beatmapProfileCache.set(String(beatmapId), { fetchedAt: Date.now(), value });
  return value;
}

async function fetchBeatmapsetComments(clientId, clientSecret, beatmapsetId) {
  const cached = commentCache.get(String(beatmapsetId));
  if (cached && Date.now() - cached.fetchedAt < MOST_PLAYED_CACHE_MS) return cached.value;
  const token = await getToken(clientId, clientSecret);
  const params = new URLSearchParams({ commentable_type: 'beatmapset', commentable_id: String(beatmapsetId), parent_id: '0', sort: 'top' });
  const response = await timedFetch(`${API_BASE}/comments?${params}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (response.status === 401) { clearTokenCache(); throw new Error('token osu! expiré ou révoqué, réessaie'); }
  if (!response.ok) throw new Error(`osu! commentaires HTTP ${response.status}`);
  const data = await response.json();
  const value = [...(data.pinned_comments || []), ...(data.comments || [])].slice(0, 30).map(item => ({ message: String(item.message || '') }));
  commentCache.set(String(beatmapsetId), { fetchedAt: Date.now(), value });
  return value;
}

function normalizeBeatmapPlaycount(item) {
  return { beatmapId: Number(item?.beatmap_id || item?.beatmap?.id || 0), count: Number(item?.count || 0) };
}

async function fetchUserMostPlayed(clientId, clientSecret, userId, limit = 100) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 100));
  const cacheKey = `${userId}:${safeLimit}`;
  const cached = mostPlayedCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < MOST_PLAYED_CACHE_MS) return cached.items;
  const token = await getToken(clientId, clientSecret);
  const url = `${API_BASE}/users/${encodeURIComponent(userId)}/beatmapsets/most_played?limit=${safeLimit}&offset=0`;
  const response = await timedFetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (response.status === 401) { clearTokenCache(); throw new Error('token osu! expiré ou révoqué, réessaie'); }
  if (!response.ok) throw new Error(`osu! most played HTTP ${response.status}`);
  const items = (await response.json()).map(normalizeBeatmapPlaycount).filter(item => item.beatmapId);
  mostPlayedCache.set(cacheKey, { fetchedAt: Date.now(), items });
  return items;
}

function createClient({ clientId, clientSecret }) {
  return {
    fetchUser: username => fetchUser(clientId, clientSecret, username),
    fetchUserBeatmapScores: (userId, beatmapId) => fetchUserBeatmapScores(clientId, clientSecret, userId, beatmapId),
    fetchUserMostPlayed: (userId, limit) => fetchUserMostPlayed(clientId, clientSecret, userId, limit),
    fetchBeatmapsetComments: beatmapsetId => fetchBeatmapsetComments(clientId, clientSecret, beatmapsetId),
    fetchBeatmapFailProfile: beatmapId => fetchBeatmapFailProfile(clientId, clientSecret, beatmapId),
  };
}

module.exports = { createClient, getToken, fetchUser, fetchUserBeatmapScores, fetchUserMostPlayed, fetchBeatmapFailProfile, fetchBeatmapsetComments, normalizeScore, normalizeBeatmapPlaycount, clearTokenCache };
