import { useState } from 'react';
import { apiRequest, authStore } from '../lib/api.js';
import { Icon } from './ui.jsx';

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const register = mode === 'register';

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST', body: form, token: null,
      });
      authStore.setToken(result.token);
      onAuthenticated(result.user, result.token);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell">
    <aside className="auth-story">
      <div className="brand brand-on-dark"><span className="brand-mark"><Icon name="message" size={21} /></span><span>chatt<span className="brand-period">.</span></span></div>
      <div className="story-copy"><span className="eyebrow"><i /> A little closer, every day</span><h1>Good conversations<br />make <em>everything</em> better.</h1><p>A quieter place for your people. Pick up where the good stuff left off.</p></div>
      <div className="story-bottom"><div className="story-bubbles"><span>M</span><span>A</span><span>J</span><span>+</span></div><div><strong>Your circle, right here</strong><small>Private chats, just for you.</small></div><span className="story-spark">✳</span></div>
      <div className="story-orbit orbit-one" /><div className="story-orbit orbit-two" />
    </aside>
    <section className="auth-panel"><div className="auth-topline"><span>YOUR SPACE TO CONNECT</span><span className="secure-note"><i /> Private by design</span></div>
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-form-heading"><span className="form-kicker">{register ? 'A good place to begin' : 'Welcome back'}</span><h2>{register ? 'Make yourself at home.' : 'Pick up the conversation.'}</h2><p>{register ? 'Create an account and bring your people along.' : 'Your people have been saving you a seat.'}</p></div>
        {register && <label className="field-label">Your name<input autoComplete="name" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="How should we call you?" maxLength={80} required /></label>}
        <label className="field-label">Email address<input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" maxLength={254} required /></label>
        <label className="field-label">Password<input type="password" autoComplete={register ? 'new-password' : 'current-password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={register ? 'At least 8 characters' : 'Enter your password'} minLength={register ? 8 : 1} maxLength={128} required /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? <span className="spinner" /> : <>{register ? 'Create your account' : 'Sign in'}<Icon name="arrow" size={18} /></>}</button>
        <div className="auth-switch"><span>{register ? 'Already have a place here?' : 'New to Chatt?'}</span><button type="button" onClick={() => { setMode(register ? 'login' : 'register'); setError(''); }}>{register ? 'Sign in' : 'Create an account'}</button></div>
      </form>
      <div className="auth-foot"><span>© 2026 Chatt</span><span>Made for the moments between.</span></div>
    </section>
  </main>;
}