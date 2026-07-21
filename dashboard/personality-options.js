(() => {
  const heartbeat = () => fetch('/api/dashboard/heartbeat', { method: 'POST', cache: 'no-store' }).catch(() => {});
  heartbeat();
  setInterval(heartbeat, 5000);
  const select = document.querySelector('select[name="personality"]');
  if (!select || select.querySelector('option[value="training_companion"]')) return;
  const option = document.createElement('option');
  option.value = 'training_companion';
  option.textContent = 'Compagnon d’entraînement';
  select.insertBefore(option, select.options[1] || null);
})();
