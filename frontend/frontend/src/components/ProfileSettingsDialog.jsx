import { useState } from 'react';
import { Avatar, Icon, nameOf } from './ui.jsx';
import './ProfileSettingsDialog.css';

export default function ProfileSettingsDialog({ user, onClose, onSave }) {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [bio, setBio] = useState(user.bio || '');
  const [photoURL, setPhotoURL] = useState(user.photoURL || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSave({
        displayName: displayName.trim(),
        bio: bio.trim(),
        photoURL: photoURL.trim() || null,
      });
    } catch (saveError) {
      setError(saveError.message || 'Profile could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-scrim profile-settings-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="modal-panel profile-settings-panel" onSubmit={submit}>
      <div className="modal-heading">
        <div><span className="form-kicker">YOUR ACCOUNT</span><h2>Profile settings</h2><p className="settings-intro">Make your profile feel like you.</p></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close settings"><Icon name="close" /></button>
      </div>

      <div className="settings-identity"><Avatar user={{ ...user, displayName, photoURL: photoURL.trim() || null }} /><span><strong>{displayName.trim() || nameOf(user)}</strong><small>{user.email}</small></span></div>

      <label className="field-label">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" maxLength={80} required /></label>
      <label className="field-label">About you <span className="settings-count">{bio.length}/500</span><textarea className="settings-bio" value={bio} onChange={(event) => setBio(event.target.value)} placeholder="A little about yourself" maxLength={500} rows={3} /></label>
      <label className="field-label">Profile photo URL<input type="url" value={photoURL} onChange={(event) => setPhotoURL(event.target.value)} placeholder="https://example.com/photo.jpg" maxLength={2048} /><small className="settings-hint">Use a public image URL. Leave blank to remove your photo.</small></label>

      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="settings-footer"><button className="settings-cancel" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" type="submit" disabled={busy || !displayName.trim()}>{busy ? <span className="spinner" /> : <>Save changes<Icon name="arrow" size={16} /></>}</button></div>
    </form>
  </div>;
}