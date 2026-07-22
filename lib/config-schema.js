function validateConfig(input, current) {
  const next = { ...current };
  const numeric = ['comfortable_stars_min', 'comfortable_stars_max', 'current_rank', 'rank_goal'];
  const lists = ['goals', 'weaknesses'];
  for (const key of numeric) {
    const value = input[key];
    next[key] = value === null || value === '' ? null : Math.max(0, Number(value) || 0);
  }
  for (const key of lists) next[key] = Array.isArray(input[key]) ? input[key].map(value => String(value).trim()).filter(Boolean).slice(0, 12) : [];
  if (['auto', 'claude', 'codex'].includes(input.provider)) next.provider = input.provider;
  if (['balanced', 'supportive', 'sarcastic', 'competitive', 'analyst', 'training_companion'].includes(input.personality)) next.personality = input.personality;
  if (['always', 'timed'].includes(input.display_mode)) next.display_mode = input.display_mode;
  if (input.display_seconds !== undefined) next.display_seconds = Math.max(5, Math.min(120, Number(input.display_seconds) || 20));
  if (typeof input.claude_first === 'boolean') next.claude_first = input.claude_first;
  if (typeof input.language === 'string' && /^[a-z]{2,8}([-_][a-z]{2,8})?$/i.test(input.language)) next.language = input.language;
  if (typeof input.rank_region === 'string') next.rank_region = input.rank_region.trim().slice(0, 40);
  if (typeof input.coach_name === 'string') next.coach_name = input.coach_name.trim().slice(0, 32) || 'Coach IA';
  if (typeof input.overlay_accent_color === 'string' && /^#[0-9a-f]{6}$/i.test(input.overlay_accent_color.trim())) next.overlay_accent_color = input.overlay_accent_color.trim().toLowerCase();
  if (input.overlay_background_opacity !== undefined) {
    next.overlay_background_opacity = Math.max(0, Math.min(100, Math.round(Number(input.overlay_background_opacity) || 0)));
    next.overlay_show_background = next.overlay_background_opacity > 0;
  }
  if (typeof input.osu_username === 'string') next.osu_username = input.osu_username.trim().slice(0, 40);
  if (typeof input.osu_client_id === 'string' && /^\d{0,20}$/.test(input.osu_client_id.trim())) next.osu_client_id = input.osu_client_id.trim();
  if (typeof input.osu_client_secret === 'string' && input.osu_client_secret.trim()) next.osu_client_secret = input.osu_client_secret.trim().slice(0, 120);
  if (input.osu_client_secret === null) next.osu_client_secret = '';
  for (const key of ['overlay_show_background', 'overlay_show_logo', 'osu_integration_enabled', 'osu_supporter', 'allow_online_recommendations', 'allow_knowledge_updates']) if (typeof input[key] === 'boolean') next[key] = input[key];
  if (next.comfortable_stars_min && next.comfortable_stars_max && next.comfortable_stars_min > next.comfortable_stars_max) {
    [next.comfortable_stars_min, next.comfortable_stars_max] = [next.comfortable_stars_max, next.comfortable_stars_min];
  }
  return next;
}

module.exports = { validateConfig };
