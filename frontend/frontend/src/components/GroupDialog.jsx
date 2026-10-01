import { useState } from 'react';
import { nameOf, Avatar, Icon } from './ui.jsx';

export default function GroupDialog({ users, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const filtered = users.filter((person) => `${nameOf(person)} ${person.email}`.toLowerCase().includes(query.toLowerCase()));
  const selectedPeople = users.filter((person) => selected.includes(person.uid));

  async function submit(event) {
    event.preventDefault();
    if (!selected.length || busy) return;
    setBusy(true);
    const groupName = name.trim() || selectedPeople.map(nameOf).join(', ').slice(0, 100) || 'New group';
    try {
      await onCreate(groupName, selected);
    } finally {
      setBusy(false);
    }
  }

  function toggle(uid) {
    setSelected((current) => current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid]);
  }

  return <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="modal-panel" onSubmit={submit}>
      <div className="modal-heading"><div><span className="form-kicker">MAKE A LITTLE ROOM</span><h2>Start a group</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
      <label className="field-label">Group name <span className="optional-label">OPTIONAL</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Sunday people" maxLength={100} autoFocus /><small className="field-hint">Leave blank to use the selected members' names.</small></label>
      <label className="search-box modal-search"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find people to add" /></label>
      <div className="member-picker">{filtered.map((person) => <button className={`member-option ${selected.includes(person.uid) ? 'selected' : ''}`} type="button" key={person.uid} onClick={() => toggle(person.uid)}><Avatar user={person} /><span><strong>{nameOf(person)}</strong><small>{person.email}</small></span><span className="selection-mark">{selected.includes(person.uid) && <Icon name="check" size={14} />}</span></button>)}{filtered.length === 0 && <p className="empty-inline">No one found. Try another name.</p>}</div>
      <div className="modal-footer"><span>{selected.length} {selected.length === 1 ? 'person' : 'people'} selected</span><button className="primary-button" type="submit" disabled={!selected.length || busy}>{busy ? 'Creating...' : 'Create group'}<Icon name="arrow" size={16} /></button></div>
    </form>
  </div>;
}