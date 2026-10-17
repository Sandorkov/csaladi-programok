/* Csak a saját családtagság olvasása. Nincs programtárolás vagy tagságmódosítás. */
window.createFamilyPanel = function createFamilyPanel(client) {
  'use strict';
  const panel = document.querySelector('#family-panel');
  const status = document.querySelector('#family-status');
  const retry = document.querySelector('#family-retry');
  let currentUserId = null, generation = 0, request = null;

  function show(state, text) {
    panel.hidden = state === 'signed-out';
    panel.dataset.state = state;
    status.textContent = text;
    status.classList.toggle('error', state === 'error');
    retry.hidden = state !== 'error';
    retry.disabled = state !== 'error';
  }

  async function load(userId, ticket) {
    if (ticket !== generation || userId !== currentUserId) return;
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const membershipResult = await client.from('family_memberships')
        .select('family_id, role').eq('user_id', userId).abortSignal(controller.signal).maybeSingle();
      if (ticket !== generation) return;
      if (membershipResult.error) throw membershipResult.error;
      const membership = membershipResult.data;
      if (!membership) { show('no-membership', 'Még nem tartozol családhoz.'); return; }
      if (!membership.family_id || !['admin', 'member'].includes(membership.role)) throw new Error('Invalid membership');
      const familyResult = await client.from('families').select('id, name')
        .eq('id', membership.family_id).abortSignal(controller.signal).single();
      if (ticket !== generation) return;
      if (familyResult.error || !familyResult.data || familyResult.data.id !== membership.family_id ||
          typeof familyResult.data.name !== 'string' || !familyResult.data.name.trim()) throw new Error('Family unavailable');
      show('member', `Család: ${familyResult.data.name} · Szerepkör: ${membership.role === 'admin' ? 'Adminisztrátor' : 'Tag'}`);
    } catch {
      if (ticket !== generation) return;
      show('error', 'Nem sikerült betölteni a családtagságot. Ellenőrizd a kapcsolatot és a családi adatbázis beállításait, majd próbáld újra.');
    } finally {
      clearTimeout(timeout);
      if (request === controller) request = null;
    }
  }

  function setUser(userId, force = false) {
    if (!force && userId === currentUserId) return;
    currentUserId = userId;
    const ticket = ++generation;
    request?.abort(); request = null;
    if (!userId) { show('signed-out', ''); return; }
    // Az előző név/szerepkör azonnal eltűnik, még mielőtt az új kérés elindulna.
    show('loading', 'Családtagság betöltése…');
    // Nem indítunk Auth-ot is használó hálózati hívást az Auth callback zárolásán belül.
    setTimeout(() => { void load(userId, ticket); }, 0);
  }

  retry.onclick = () => { if (currentUserId) setUser(currentUserId, true); };
  show('signed-out', '');
  return { setUser };
};
