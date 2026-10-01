import { Avatar, Icon, nameOf } from './ui.jsx';

export default function ProfileMenu({ user, onDismiss, onLogout, onSettings }) {
  return <>
    <button className="dismiss-layer" onClick={onDismiss} aria-label="Close account menu" />
    <div className="profile-menu">
      <div className="profile-menu-top"><Avatar user={user} /><span><strong>{nameOf(user)}</strong><small>{user.email}</small></span></div>
      <button className="profile-menu-item" onClick={onSettings}><Icon name="settings" size={17} />Account settings<span>›</span></button>
      <button className="profile-menu-item profile-logout" onClick={onLogout}><Icon name="logout" size={17} />Sign out<span>›</span></button>
    </div>
  </>;
}
