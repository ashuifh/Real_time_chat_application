import { useEffect, useRef } from 'react';
import { Avatar, Icon, nameOf, timeOf } from './ui.jsx';

export default function ConversationPanel({
  activeChat, user, peer, members, messages, loadingMessages, hasMore, nextCursor,
  typingNames, socketConnected, messageSearch, setMessageSearch, draft, onDraftChange,
  onSend, onUpload, onLoadOlder, onMobileBack, detailsOpen, setDetailsOpen, online,
}) {
  const bottomRef = useRef(null);
  const peerId = peer?.uid;
  const title = activeChat?.type === 'group' ? activeChat.name : nameOf(peer);
  const filtered = messages.filter((message) => !messageSearch || message.text?.toLowerCase().includes(messageSearch.toLowerCase()));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, activeChat?.id]);

  if (!activeChat) return <section className="conversation-panel"><div className="welcome-panel">
    <div className="welcome-art"><div className="welcome-orbit welcome-orbit-a" /><div className="welcome-orbit welcome-orbit-b" /><div className="welcome-note note-one"><i /> just checking in</div><div className="welcome-note note-two"><span>✳</span> made my day</div><div className="welcome-center"><Icon name="message" size={34} /></div><i className="welcome-confetti confetti-a" /><i className="welcome-confetti confetti-b" /><i className="welcome-confetti confetti-c" /></div>
    <span className="section-eyebrow welcome-eyebrow">A GOOD PLACE TO CATCH UP</span><h2>Your people are<br /><em>one hello away.</em></h2><p>Pick a conversation from your inbox,<br />or find someone new to talk to.</p><button className="primary-button welcome-action" onClick={onMobileBack}>Find your people<Icon name="arrow" size={17} /></button><div className="welcome-footnote"><span className={`footer-presence ${socketConnected ? 'online' : ''}`} />{socketConnected ? 'Connected and ready' : 'Getting your space ready'}</div>
  </div></section>;

  return <section className={`conversation-panel conversation-open`}>
    <header className="conversation-header"><button className="icon-button mobile-back" onClick={onMobileBack} aria-label="Back to inbox"><Icon name="back" /></button>
      {activeChat.type === 'group' ? <span className="group-avatar header-avatar"><Icon name="group" size={19} /></span> : <Avatar user={peer} online={online.has(peerId)} />}
      <div className="conversation-heading"><strong>{title}</strong><span>{activeChat.type === 'group' ? `${members.length} people · Group conversation` : online.has(peerId) ? 'Here now' : 'A conversation just for you two'}</span></div>
      <div className="conversation-actions"><label className="search-box message-search"><Icon name="search" size={16} /><input value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Find in chat" /></label><button className={`icon-button details-toggle ${detailsOpen ? 'pressed' : ''}`} onClick={() => setDetailsOpen((value) => !value)} title="Conversation details" aria-label="Conversation details"><Icon name="info" /></button></div>
    </header>
    <div className="conversation-body"><div className="message-column"><div className="message-scroll">
      {hasMore && <button className="load-older" onClick={onLoadOlder} disabled={loadingMessages}>{loadingMessages ? 'Loading...' : 'Load earlier messages'}</button>}
      {loadingMessages && !messages.length && <div className="messages-loading"><span className="spinner" />Opening conversation...</div>}
      {!loadingMessages && !messages.length && <div className="conversation-empty"><span className="empty-icon"><span>✳</span></span><strong>This is the beginning.</strong><span>Send a little hello to {activeChat.type === 'group' ? 'the group' : nameOf(peer)}.</span></div>}
      {filtered.map((message, index) => {
        const own = message.senderId === user.uid;
        const previous = filtered[index - 1];
        const showDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
        const sender = members.find((member) => member.uid === message.senderId);
        return <div className="message-unit" key={message.id}>{showDay && <div className="day-divider"><span>{new Date(message.createdAt).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span></div>}
          <div className={`message-line ${own ? 'message-own' : ''}`}>{!own && <Avatar user={sender} small />}<div className="message-content"><div className={`message-bubble ${own ? 'bubble-own' : 'bubble-other'} ${message.deleted ? 'bubble-deleted' : ''}`}>
            {activeChat.type === 'group' && !own && <small className="message-sender">{nameOf(sender)}</small>}
            {message.deleted ? <span className="deleted-message">This message was removed</span> : message.text && <p>{message.text}</p>}
            {!message.deleted && message.attachments?.map((attachment) => attachment.mimeType?.startsWith('image/') ? <a href={attachment.url} target="_blank" rel="noreferrer" className="message-image-link" key={attachment.url}><img className="message-image" src={attachment.url} alt={attachment.name} /><span>{attachment.name}</span></a> : <a className="message-file" href={attachment.url} target="_blank" rel="noreferrer" key={attachment.url}><Icon name="file" size={18} /><span><strong>{attachment.name}</strong><small>{attachment.mimeType}</small></span><Icon name="arrow" size={15} /></a>)}
          </div><div className="message-meta"><time>{timeOf(message.createdAt)}</time>{own && <span className={`read-mark ${message.readBy?.length > 1 ? 'read-mark-seen' : ''}`} title={message.readBy?.length > 1 ? 'Seen' : 'Sent'}><Icon name="check" size={13} />{message.readBy?.length > 1 && <Icon name="check" size={13} />}</span>}</div></div></div>
        </div>;
      })}
      {!!typingNames.length && <div className="typing-line"><span className="typing-dots"><i /><i /><i /></span><span>{typingNames.length === 1 ? `${typingNames[0]} is typing` : 'A few people are typing'}</span></div>}<div ref={bottomRef} />
    </div>
    <form className="composer" onSubmit={onSend}><input type="file" hidden onChange={onUpload} id="message-attachment" /><button className="icon-button composer-attach" type="button" title="Attach a file" aria-label="Attach a file" onClick={() => document.getElementById('message-attachment')?.click()}><Icon name="attach" /></button><textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSend(event); } }} placeholder={socketConnected ? `Message ${activeChat.type === 'group' ? 'the group' : nameOf(peer)}...` : 'Waiting for secure connection...'} aria-label="Write a message" rows={1} disabled={!socketConnected} /><span className="composer-hint">ENTER TO SEND</span><button className="send-button" type="submit" title="Send message" aria-label="Send message" disabled={!draft.trim() || !socketConnected}><Icon name="send" size={17} /></button></form>
    <div className="composer-caption">Your conversations stay between your people.</div></div>
    {detailsOpen && <aside className="details-panel"><button className="details-close icon-button" onClick={() => setDetailsOpen(false)} aria-label="Close details"><Icon name="close" size={18} /></button><div className="details-person">{activeChat.type === 'group' ? <span className="group-avatar details-avatar"><Icon name="group" size={24} /></span> : <Avatar user={peer} online={online.has(peerId)} />}<h3>{title}</h3><p>{activeChat.type === 'group' ? 'A shared space for your people.' : peer?.email}</p></div><div className="details-rule" /><div className="details-section-label">PEOPLE HERE <span>{members.length}</span></div><div className="details-members">{members.map((member) => <div className="detail-member" key={member.uid}><Avatar user={member} online={online.has(member.uid)} /><span><strong>{member.uid === user.uid ? 'You' : nameOf(member)}</strong><small>{member.uid === user.uid ? 'Your account' : member.email || 'Member'}</small></span></div>)}</div></aside>}
    </div>
  </section>;
}