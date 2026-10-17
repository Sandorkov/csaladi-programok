// node tests/auth.test.cjs – szimulált Supabase Auth; nincs fiók- vagy programadat-módosítás.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'auth.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
for (const [, id] of source.matchAll(/querySelector\('#([^']+)'\)/g)) assert(html.includes(`id="${id}"`));
const home = 'https://sandorkov.github.io/csaladi-programok/';
const user = { email: 'teszt@example.com', user_metadata: { full_name: '<Teszt családtag>' } };

async function fixture(options = {}) {
  const elements = new Map(), listeners = new Map(), attempts = new Map(options.attempt ? [['csaladi-programok.oauth-attempt', String(Date.now())]] : []);
  const calls = { login: [], logout: [], exchange: [], config: [] };
  const location = new URL(options.url || home);
  location.assign = href => { calls.redirect = href; };
  let storedSession = options.session || null, notify;
  const context = {
    URL, URLSearchParams, location, console,
    history: { state: null, replaceState(state, title, href) { calls.cleanURL = href; } },
    document: {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, { hidden: false, disabled: false, textContent: '', classList: { toggle() {} } });
        return elements.get(selector);
      },
      createElement() { return { remove() {} }; },
      head: { append(script) { script.onerror(); } }
    },
    sessionStorage: { setItem(k,v) { attempts.set(k,v); }, getItem(k) { return attempts.get(k) ?? null; }, removeItem(k) { attempts.delete(k); } },
    setTimeout() { return 1; }, clearTimeout() {},
    FAMILY_AUTH_CONFIG: {
      supabaseUrl: 'https://testproject.supabase.co', supabasePublishableKey: 'sb_publishable_test', redirectTo: home,
      ...options.config
    },
    addEventListener(name, callback) { listeners.set(name, callback); },
    supabase: options.sdkFailure ? null : {
      createClient(url, key, config) {
        calls.config.push({ url, key, config });
        return { auth: {
          onAuthStateChange(callback) { notify = callback; return { data: { subscription: { unsubscribe() {} } } }; },
          async getSession() { return { data: { session: storedSession }, error: options.sessionError ? Error('network') : null }; },
          async signInWithOAuth(args) {
            calls.login.push(args);
            return { data: { url: 'https://testproject.supabase.co/auth/v1/authorize?provider=google' }, error: options.loginError ? Error('network') : null };
          },
          async exchangeCodeForSession(code) {
            calls.exchange.push(code);
            if (options.exchangeError) return { error: Error('expired') };
            storedSession = { user }; notify('SIGNED_IN', storedSession);
            return { data: { session: storedSession }, error: null };
          },
          async signOut(args) {
            calls.logout.push(args);
            if (options.logoutError) return { error: Error('network') };
            storedSession = null; notify('SIGNED_OUT', null); return { error: null };
          }
        } };
      }
    }
  };
  context.window = context;
  // Any accidental attempt to access program storage must fail the test.
  Object.defineProperty(context, 'indexedDB', { get() { throw Error('Auth accessed IndexedDB!'); } });
  Object.defineProperty(context, 'localStorage', { get() { throw Error('Auth touched localStorage outside its SDK!'); } });
  vm.runInContext(source, vm.createContext(context));
  await context.familyAuthReady;
  return { elements, calls, attempts, listeners, context, notify: (event, session) => notify(event, session) };
}
const node = (test, id) => test.elements.get(`#${id}`);
async function main() {
  let test = await fixture();
  assert.equal(node(test,'google-login').disabled, false);
  assert.equal(node(test,'google-logout').hidden, true);
  assert.equal(test.calls.config[0].config.auth.persistSession, true);
  assert.equal(test.calls.config[0].config.auth.autoRefreshToken, true);
  assert.equal(test.calls.config[0].config.auth.flowType, 'pkce');
  assert.equal(test.calls.config[0].config.auth.detectSessionInUrl, false);
  await node(test,'google-login').onclick();
  assert.equal(test.calls.login[0].provider, 'google');
  assert.equal(test.calls.login[0].options.redirectTo, home);
  assert.match(test.calls.redirect, /^https:\/\/testproject\.supabase\.co\/auth\/v1\/authorize/);
  test.listeners.get('pageshow')({persisted:true});
  assert.match(node(test,'auth-status').textContent, /megszakadt/);
  assert.equal(node(test,'google-login').disabled, false);

  test = await fixture({session:{user}});
  assert.equal(node(test,'auth-identity').textContent, '<Teszt családtag>');
  assert.equal(node(test,'google-login').hidden, true);
  assert.equal(node(test,'google-logout').hidden, false);
  await node(test,'google-logout').onclick();
  assert.equal(test.calls.logout[0].scope, 'local');
  assert.equal(node(test,'auth-identity').hidden, true);
  assert.match(node(test,'auth-status').textContent, /megmaradtak/);
  test.notify('SIGNED_IN',{user:{email:'email-only@example.com'}});
  assert.equal(node(test,'auth-identity').textContent,'email-only@example.com');
  test.notify('SIGNED_OUT',null); assert.equal(node(test,'google-login').hidden,false);

  test = await fixture({url:home+'?code=one-time-code&keep=yes',attempt:true});
  assert.equal(test.calls.exchange[0], 'one-time-code');
  assert.equal(node(test,'google-logout').hidden, false);
  assert.equal(test.calls.cleanURL, home+'?keep=yes');
  test = await fixture({url:home+'?code=expired',exchangeError:true});
  assert.match(node(test,'auth-status').textContent, /lejárt/);
  assert.equal(node(test,'google-login').disabled,false);
  test = await fixture({url:home+'#error=access_denied&error_description=PRIVATE_PROVIDER_ERROR'});
  assert.match(node(test,'auth-status').textContent,/megszakítottad/);
  assert(!node(test,'auth-status').textContent.includes('PRIVATE_PROVIDER_ERROR'));
  assert.equal(test.calls.cleanURL,home);
  test = await fixture({url:home+'?error=server_error'});
  assert.match(node(test,'auth-status').textContent,/Nem sikerült/);
  test = await fixture({attempt:true});
  assert.match(node(test,'auth-status').textContent,/nem fejeződött be/);
  test = await fixture({loginError:true}); await node(test,'google-login').onclick();
  assert.match(node(test,'auth-status').textContent,/Nem sikerült elindítani/);
  assert.equal(node(test,'google-login').disabled,false);
  test = await fixture({session:{user},logoutError:true}); await node(test,'google-logout').onclick();
  assert.equal(node(test,'google-logout').hidden,false);
  assert.equal(node(test,'google-logout').disabled,false);
  test = await fixture({sessionError:true}); assert.match(node(test,'auth-status').textContent,/most nem érhető el/);
  test = await fixture({sdkFailure:true}); assert.match(node(test,'auth-status').textContent,/most nem érhető el/);
  test = await fixture({config:{supabaseUrl:''}}); assert.match(node(test,'auth-status').textContent,/hiányzik/);
  test = await fixture({config:{supabasePublishableKey:'sb_secret_should_never_be_used'}});
  assert.equal(test.calls.config.length,0); assert.match(node(test,'auth-status').textContent,/Hibás/);
  test = await fixture({url:'http://localhost:8000/'});
  assert.equal(test.calls.config.length,0); assert.match(node(test,'auth-status').textContent,/oldalon próbáld/);
  for (const file of ['app.js','backup.js']) assert(!fs.readFileSync(path.join(__dirname,'..',file),'utf8').includes("querySelectorAll('button')"));
  console.log('PASS: configured Google redirect; PKCE; persisted-session UI; sign-out; auth events; cancellation/back navigation; callback errors and cleanup; expired code; SDK/network/config failures; local-origin guidance; auth isolated from program storage and button locks.');
  console.log('Mock Auth/DOM only: real Google login, token persistence/refresh and browser visuals are NOT tested.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
