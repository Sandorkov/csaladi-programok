/* A belépés önálló modul: a programokat és az IndexedDB-t nem kezeli. */
(() => {
  'use strict';
  const login = document.querySelector('#google-login');
  const logout = document.querySelector('#google-logout');
  const identity = document.querySelector('#auth-identity');
  const status = document.querySelector('#auth-status');
  const attemptKey = 'csaladi-programok.oauth-attempt';
  const sdkURL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
  let client = null, session = null, working = true, ready = false;
  let familyPanel = null, sessionRevision = 0;

  function applySession(nextSession) {
    session = nextSession;
    familyPanel?.setUser(session?.user?.id ?? null);
    render();
  }

  function tell(text, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
  }

  function render() {
    const user = session?.user;
    identity.hidden = !user;
    identity.textContent = user ? (user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Bejelentkezett felhasználó') : '';
    login.hidden = Boolean(user);
    logout.hidden = !user;
    login.disabled = logout.disabled = working || !ready;
  }

  function setAttempt() {
    try { sessionStorage.setItem(attemptKey, String(Date.now())); }
    catch { /* A belépési hiba kezelését a letiltott sessionStorage sem akadályozhatja. */ }
  }
  function takeAttempt() {
    try {
      const value = Number(sessionStorage.getItem(attemptKey));
      sessionStorage.removeItem(attemptKey);
      return value > 0 && Date.now() - value >= 0 && Date.now() - value < 30 * 60 * 1000;
    } catch { return false; }
  }

  function callbackInfo() {
    const url = new URL(location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    return {
      code: url.searchParams.get('code'),
      error: url.searchParams.get('error') || hash.get('error'),
      errorCode: url.searchParams.get('error_code') || hash.get('error_code')
    };
  }

  function cleanCallback() {
    const url = new URL(location.href);
    for (const key of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
    const hash = new URLSearchParams(url.hash.slice(1));
    if (['error', 'error_code', 'error_description', 'access_token', 'refresh_token'].some(key => hash.has(key))) url.hash = '';
    try { history.replaceState(history.state, '', url.href); }
    catch { /* Az üzenetkezelés akkor is működik, ha nem módosítható a címsor. */ }
  }

  function loadSDK() {
    if (window.supabase?.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => {
        script.remove();
        reject(new Error('sdk-load'));
      }, 15000);
      script.src = sdkURL;
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('sdk-load')); };
      document.head.append(script);
    });
  }

  login.onclick = async () => {
    if (!ready || working || !client) return;
    working = true; render();
    tell('Átirányítás a Google bejelentkezési oldalára…');
    try {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.FAMILY_AUTH_CONFIG.redirectTo, skipBrowserRedirect: true }
      });
      if (error || !data?.url) throw error || new Error('missing-url');
      const target = new URL(data.url);
      if (target.origin !== new URL(window.FAMILY_AUTH_CONFIG.supabaseUrl).origin || target.pathname !== '/auth/v1/authorize') throw new Error('invalid-url');
      setAttempt();
      location.assign(target.href);
    } catch {
      takeAttempt();
      working = false; render();
      tell('Nem sikerült elindítani a Google-belépést. Ellenőrizd az internetkapcsolatot és a Supabase Google-beállításait, majd próbáld újra. A helyi programjaid megmaradtak.', true);
    }
  };

  logout.onclick = async () => {
    if (!ready || working || !client) return;
    working = true; familyPanel?.setUser(null); render();
    tell('Kijelentkezés…');
    try {
      // Csak az ezen böngészőben használt munkamenetből jelentkezünk ki.
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      applySession(null); takeAttempt();
      tell('Kijelentkeztél. A helyi programok, képek és kedvencek megmaradtak.');
    } catch {
      familyPanel?.setUser(session?.user?.id ?? null);
      tell('Nem sikerült kijelentkezni. Ellenőrizd az internetkapcsolatot, majd próbáld újra. A helyi adatok nem változtak.', true);
    } finally { working = false; render(); }
  };

  // A böngésző Vissza gombja a korábbi oldalt gyorsítótárból is visszahozhatja.
  window.addEventListener('pageshow', event => {
    if (!event.persisted || !ready || !takeAttempt()) return;
    working = false; render();
    if (!session) tell('A Google-belépés megszakadt vagy nem fejeződött be. Újra próbálhatod; a helyi adatok megmaradtak.');
  });

  async function initialize() {
    render();
    const callback = callbackInfo();
    try {
      const config = window.FAMILY_AUTH_CONFIG;
      if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
        tell('A Google-belépés még nincs beállítva: hiányzik a Supabase projektcíme vagy publishable kulcsa. A helyi funkciók továbbra is használhatók.');
        return;
      }
      const project = new URL(config.supabaseUrl);
      if (project.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(project.hostname) || project.username || project.password || project.search || project.hash || project.pathname !== '/' ||
          !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.supabasePublishableKey)) {
        tell('Hibás belépési beállítás. HTTPS Supabase projektcímet és sb_publishable_ kezdetű nyilvános kulcsot adj meg az auth-config.js fájlban.', true);
        return;
      }
      // A PKCE-ellenőrző adat a kezdő böngészőcímen tárolódik, ezért azonos címre kell visszatérni.
      const destination = new URL(config.redirectTo);
      if (location.origin !== destination.origin || location.pathname.replace(/index\.html$/, '') !== destination.pathname) {
        tell('A Google-belépést a https://sandorkov.github.io/csaladi-programok/ oldalon próbáld ki. A helyi alkalmazás továbbra is használható.');
        return;
      }
      tell('Bejelentkezési állapot ellenőrzése…');
      await loadSDK();
      client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce', storageKey: 'csaladi-programok.supabase-auth' }
      });
      window.sharedPrograms?.setClient(client, () => familyPanel?.setUser(session?.user?.id ?? null, true));
      familyPanel = window.createFamilyPanel?.(client, state => window.sharedPrograms?.setMembership(state)) ?? null;
      client.auth.onAuthStateChange((event, nextSession) => {
        sessionRevision++;
        applySession(nextSession);
        if (event === 'SIGNED_IN') tell('Sikeres belépés. A saját eszközön és a családi nézet adatai külön maradnak.');
        if (event === 'SIGNED_OUT') tell('Kijelentkeztél. A helyi programok és képek megmaradtak.');
      });

      let callbackFailed = false;
      const interrupted = takeAttempt();
      if (callback.error || callback.errorCode) {
        callbackFailed = true;
        const denied = callback.error === 'access_denied' || callback.errorCode === 'access_denied';
        tell(denied ? 'A Google-belépést megszakítottad vagy nem engedélyezted. Újra próbálhatod; a helyi adatok megmaradtak.' : 'Nem sikerült a Google-belépés. Próbáld újra; ha ismét hibázik, ellenőrizd a Google- és Supabase-beállításokat. A helyi adatok megmaradtak.', !denied);
      } else if (callback.code) {
        const { data, error } = await client.auth.exchangeCodeForSession(callback.code);
        if (error || !data?.session) {
          callbackFailed = true;
          tell('Nem sikerült befejezni a belépést. Lehet, hogy a belépési hivatkozás lejárt vagy másik böngészőben indult. Indíts új belépést ezen az oldalon. A helyi adatok megmaradtak.', true);
        }
      }
      const revision = sessionRevision;
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (revision === sessionRevision) applySession(data?.session ?? null);
      ready = true;
      if (!callbackFailed) tell(session ? 'Bejelentkezve. A Családi programok nézetben érheted el a közös listát.' : interrupted ? 'A Google-belépés nem fejeződött be. Újra próbálhatod; a helyi adatok megmaradtak.' : 'Nem vagy bejelentkezve. A helyi programok belépés nélkül is használhatók.');
    } catch {
      applySession(null);
      ready = false;
      tell('A bejelentkezés most nem érhető el. Ellenőrizd az internetkapcsolatot és a böngésző helyi adattárolási engedélyét, majd frissítsd az oldalt. A helyi programok továbbra is használhatók.', true);
    } finally {
      if (callback.code || callback.error || callback.errorCode) cleanCallback();
      working = false; render();
    }
  }
  window.familyAuthReady = initialize();
})();
