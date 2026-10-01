import { Avatar, Icon, nameOf, timeOf } from './ui.jsx';

export default function ChatSidebar({
  user, chats, visibleChats, matchingPeople, userMap, activeChatId, unread, online,
  socketConnected, loadingChats, chatSearch, setChatSearch, filter, setFilter,
  peopleView, setPeopleView, onSelectChat, onStartDirect, onStartGroup,
  profileOpen, setProfileOpen, error, onDismissError,
}) {
  return <>
    <aside className="rail">
      <button className="brand-mark rail-brand" title="Chatt" aria-label="Chatt"><Icon name="message" size={20} /></button>
      <div className="rail-rule" />
      <button className={`rail-button ${!peopleView ? 'rail-active' : ''}`} onClick={() => setPeopleView(false)} title="Chats" aria-label="Chats"><Icon name="message" /></button>
      <button className={`rail-button ${peopleView ? 'rail-active' : ''}`} onClick={() => setPeopleView(true)} title="People" aria-label="People"><Icon name="group" /></button>
      <div className="rail-spacer" />
      <span className={`connection-indicator ${socketConnected ? 'connected' : ''}`} title={socketConnected ? 'Realtime connected' : 'Connecting to realtime'} />
      <button className="rail-avatar-button" onClick={() => setProfileOpen((value) => !value)} title="Your account"><Avatar user={user} /></button>
    </aside>

    <section className="inbox-panel">
      <header className="inbox-header">
        <div className="inbox-title-row"><div><span className="section-eyebrow">YOUR MESSAGES</span><h1>{peopleView ? 'People' : 'Inbox'}<span className="inbox-total">{peopleView ? matchingPeople.length : chats.length}</span></h1></div><button className="icon-button new-chat-button" onClick={() => peopleView ? onStartGroup() : setPeopleView(true)} title={peopleView ? 'Create group' : 'Start a new chat'} aria-label={peopleView ? 'Create group' : 'Start a new chat'}><Icon name={peopleView ? 'group' : 'add'} /></button></div>
        <label className="search-box inbox-search"><Icon name="search" size={17} /><input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder={peopleView ? 'Search people' : 'Search conversations'} /><kbd>/</kbd></label>
        {!peopleView && <div className="filter-tabs"><button className={filter === 'all' ? 'filter-selected' : ''} onClick={() => setFilter('all')}>All</button><button className={filter === 'unread' ? 'filter-selected' : ''} onClick={() => setFilter('unread')}>Unread</button><button className={filter === 'groups' ? 'filter-selected' : ''} onClick={() => setFilter('groups')}>Groups</button></div>}
      </header>

      {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" onClick={onDismissError} aria-label="Dismiss"><Icon name="close" size={16} /></button></div>}
      {peopleView ? <div className="people-list"><div className="list-caption">START A CONVERSATION</div>
        {matchingPeople.map((person) => <button className="person-row" key={person.uid} onClick={() => onStartDirect(person)}><Avatar user={person} online={online.has(person.uid)} /><span className="person-copy"><strong>{nameOf(person)}</strong><small>{person.email}</small></span><Icon name="arrow" size={17} /></button>)}
        {!matchingPeople.length && <div className="empty-list"><span className="empty-icon"><Icon name="search" size={22} /></span><strong>No people found</strong><span>Try a different name or email.</span></div>}
        <button className="group-create-link" onClick={onStartGroup}><span className="group-link-mark"><Icon name="group" size={17} /></span><span><strong>Bring people together</strong><small>Start a new group chat</small></span><Icon name="chevron" size={17} /></button>
      </div> : <div className="chat-list">
        {loadingChats && !chats.length && <div className="list-loading"><span className="spinner" />Getting your conversations...</div>}
        {visibleChats.map((chat) => {
          const peerId = chat.members?.find((uid) => uid !== user.uid);
          const person = userMap.get(peerId);
          const title = chat.type === 'group' ? chat.name : nameOf(person);
          return <button key={chat.id} className={`chat-row ${chat.id === activeChatId ? 'chat-row-selected' : ''}`} onClick={() => onSelectChat(chat)}>
            <span className="chat-avatar-wrap">{chat.type === 'group' ? <span className="group-avatar"><Icon name="group" size={20} /></span> : <Avatar user={person} online={online.has(peerId)} />}</span>
            <span className="chat-row-main"><span className="chat-row-top"><strong>{title}</strong><time>{timeOf(chat.lastMessage?.createdAt || chat.updatedAt)}</time></span><span className="chat-row-bottom"><span>{chat.lastMessage?.text || (chat.type === 'group' ? `${chat.members?.length || 0} people` : 'Start a conversation')}</span>{unread[chat.id] > 0 && <b>{unread[chat.id]}</b>}</span></span>
          </button>;
        })}
        {!loadingChats && !visibleChats.length && <div className="empty-list"><span className="empty-icon"><Icon name="message" size={22} /></span><strong>{chatSearch ? 'Nothing matched' : 'Your inbox is clear'}</strong><span>{chatSearch ? 'Try another search.' : 'Say hello to someone to get started.'}</span>{!chatSearch && <button onClick={() => setPeopleView(true)}>Find your people<Icon name="arrow" size={15} /></button>}</div>}
        {visibleChats.length > 0 && <button className="add-chat-row" onClick={() => setPeopleView(true)}><span><Icon name="add" size={17} /></span>Start a new conversation</button>}
      </div>}
      <footer className="inbox-footer"><span className={`footer-presence ${socketConnected ? 'online' : ''}`} />{socketConnected ? 'Connected securely' : 'Connecting...'}<span className="footer-lock"><Icon name="info" size={14} /></span></footer>
    </section>
  </>;
}