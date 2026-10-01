import { useEffect, useMemo, useRef, useState } from 'react';
import { API_URL, apiRequest, authStore, loadSocketClient } from './lib/api.js';
import AuthScreen from './components/AuthScreen.jsx';
import ChatSidebar from './components/ChatSidebar.jsx';
import ConversationPanel from './components/ConversationPanel.jsx';
import GroupDialog from './components/GroupDialog.jsx';
import ProfileMenu from './components/ProfileMenu.jsx';
import ProfileSettingsDialog from './components/ProfileSettingsDialog.jsx';
import { nameOf } from './components/ui.jsx';
import './App.css';

function upsert(messages, incoming) {
  if (messages.some((message) => message.id === incoming.id)) {
    return messages.map((message) => message.id === incoming.id ? incoming : message);
  }
  return [...messages, incoming];
}

export default function App() {
  const [token, setToken] = useState(() => authStore.getToken());
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(Boolean(authStore.getToken()));
  const [chats, setChats] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [peopleView, setPeopleView] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [unread, setUnread] = useState({});
  const [online, setOnline] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [socketConnected, setSocketConnected] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const socketRef = useRef(null);
  const activeChatRef = useRef(activeChat);
  const typingTimer = useRef(null);
  const readReceiptIds = useRef(new Set());
  activeChatRef.current = activeChat;

  useEffect(() => {
    if (!token) {
      setBooting(false);
      setUser(null);
      return undefined;
    }
    let alive = true;
    setBooting(true);
    apiRequest('/auth/me', { token }).then(({ user: currentUser }) => {
      if (alive) setUser(currentUser);
    }).catch(() => {
      authStore.clear();
      if (alive) { setToken(null); setUser(null); }
    }).finally(() => alive && setBooting(false));
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if (!token || !user) return undefined;
    let alive = true;
    setLoadingChats(true);
    Promise.allSettled([apiRequest('/chats', { token }), apiRequest('/users', { token })]).then(([chatResult, userResult]) => {
      if (!alive) return;
      if (chatResult.status === 'fulfilled') setChats(chatResult.value.chats || []);
      else setError(chatResult.reason.message);
      if (userResult.status === 'fulfilled') setUsers(userResult.value.users || []);
    }).finally(() => alive && setLoadingChats(false));
    return () => { alive = false; };
  }, [token, user]);

  useEffect(() => {
    if (!token || !user) return undefined;
    let disposed = false;
    let socket;
    loadSocketClient().then((io) => {
      if (disposed) return;
      socket = io(API_URL, { auth: { token }, reconnection: true, timeout: 10000 });
      socketRef.current = socket;
      socket.on('connect', () => { setSocketConnected(true); socket.emit('user:setup'); });
      socket.on('disconnect', () => setSocketConnected(false));
      socket.on('connect_error', (cause) => {
        setSocketConnected(false);
        setError(cause.message === 'Unauthorized' ? 'Session expired. Please sign in again.' : 'Realtime connection unavailable; retrying.');
      });
      socket.on('user:online', ({ userId }) => setOnline((current) => new Set(current).add(userId)));
      socket.on('user:offline', ({ userId }) => setOnline((current) => { const next = new Set(current); next.delete(userId); return next; }));
      socket.on('typing:update', ({ chatId, userId, typing }) => {
        if (chatId !== activeChatRef.current?.id || userId === user.uid) return;
        setTypingUsers((current) => { const next = new Set(current); typing ? next.add(userId) : next.delete(userId); return next; });
      });
      socket.on('message:new', ({ chatId, message }) => {
        if (chatId === activeChatRef.current?.id) setMessages((current) => upsert(current, message));
        else if (message.senderId !== user.uid) setUnread((current) => ({ ...current, [chatId]: (current[chatId] || 0) + 1 }));
        refreshChats(token);
      });
      socket.on('message:read', ({ chatId, messageId, userId }) => {
        if (chatId === activeChatRef.current?.id) setMessages((current) => current.map((message) => message.id === messageId ? { ...message, readBy: [...new Set([...(message.readBy || []), userId])] } : message));
      });
      socket.on('message:deleted', ({ chatId, messageId }) => {
        if (chatId === activeChatRef.current?.id) setMessages((current) => current.map((message) => message.id === messageId ? { ...message, text: '', attachments: [], deleted: true } : message));
      });
    }).catch((cause) => { if (!disposed) setError(cause.message); });
    return () => {
      disposed = true;
      socket?.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [token, user]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !activeChat) return undefined;
    setMessages([]);
    setTypingUsers(new Set());
    setUnread((current) => ({ ...current, [activeChat.id]: 0 }));
    socket.emit('chat:join', { chatId: activeChat.id }, (result) => {
      if (result?.ok) fetchMessages(activeChat.id, null);
      else setError(result?.error || 'Unable to join conversation.');
    });
    return () => {
      socket.emit('chat:leave', { chatId: activeChat.id });
      socket.emit('typing:stop', { chatId: activeChat.id });
    };
  }, [activeChat?.id, socketConnected]);

  useEffect(() => {
    if (!activeChat || !socketConnected) return;
    messages.forEach((message) => {
      if (message.senderId === user?.uid || message.readBy?.includes(user?.uid) || readReceiptIds.current.has(message.id)) return;
      readReceiptIds.current.add(message.id);
      socketRef.current?.emit('message:read', { chatId: activeChat.id, messageId: message.id });
    });
  }, [activeChat?.id, messages, socketConnected, user?.uid]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const userMap = useMemo(() => new Map(users.map((person) => [person.uid, person])), [users]);
  const visibleChats = useMemo(() => chats.filter((chat) => {
    const peer = userMap.get(chat.members?.find((uid) => uid !== user?.uid));
    const title = chat.type === 'group' ? chat.name : nameOf(peer);
    const query = chatSearch.toLowerCase();
    const matchesQuery = !query || title.toLowerCase().includes(query) || chat.lastMessage?.text?.toLowerCase().includes(query);
    const matchesFilter = filter === 'all' || (filter === 'groups' && chat.type === 'group') || (filter === 'unread' && unread[chat.id]);
    return matchesQuery && matchesFilter;
  }), [chats, userMap, user?.uid, chatSearch, filter, unread]);
  const matchingPeople = useMemo(() => users.filter((person) => `${nameOf(person)} ${person.email}`.toLowerCase().includes(chatSearch.toLowerCase())), [users, chatSearch]);
  const peerId = activeChat?.members?.find((uid) => uid !== user?.uid);
  const peer = userMap.get(peerId);
  const members = useMemo(() => {
    const memberIds = activeChat?.members || [];
    const orderedIds = [...memberIds.filter((uid) => uid === user?.uid), ...memberIds.filter((uid) => uid !== user?.uid)];
    const seenEmails = new Set();
    return orderedIds.reduce((unique, uid) => {
      const member = uid === user?.uid ? user : userMap.get(uid);
      if (!member) return unique;
      const email = member.email?.trim().toLowerCase();
      if (email && seenEmails.has(email)) return unique;
      if (email) seenEmails.add(email);
      unique.push(member);
      return unique;
    }, []);
  }, [activeChat?.members, user?.uid, user, userMap]);
  const typingNames = [...typingUsers].map((uid) => nameOf(userMap.get(uid)));

  async function refreshChats(authToken = token) {
    try { const result = await apiRequest('/chats', { token: authToken }); setChats(result.chats || []); }
    catch (cause) { setError(cause.message); }
  }

  async function fetchMessages(chatId, cursor) {
    setLoadingMessages(true);
    try {
      const query = new URLSearchParams({ limit: '50', ...(cursor ? { cursor } : {}) });
      const result = await apiRequest(`/chats/${encodeURIComponent(chatId)}/messages?${query}`, { token });
      const chronologicalPage = [...result.messages].reverse();
      setMessages((current) => cursor
        ? [...chronologicalPage, ...current.filter((message) => !chronologicalPage.some((older) => older.id === message.id))]
        : chronologicalPage);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (cause) { setError(cause.message); }
    finally { setLoadingMessages(false); }
  }

  function selectChat(chat) {
    setActiveChat(chat);
    setPeopleView(false);
    setMessageSearch('');
    setDetailsOpen(false);
    setError('');
  }

  async function startDirect(person) {
    try {
      const result = await apiRequest('/chats', { method: 'POST', body: { userId: person.uid }, token });
      setChats((current) => [result.chat, ...current.filter((chat) => chat.id !== result.chat.id)]);
      selectChat(result.chat);
    } catch (cause) { setError(cause.message); }
  }

  async function createGroup(name, memberIds) {
    try {
      const result = await apiRequest('/chats/group', { method: 'POST', body: { name, memberIds }, token });
      setChats((current) => [result.chat, ...current]);
      setGroupOpen(false);
      selectChat(result.chat);
      setToast('Your group is ready.');
    } catch (cause) { setError(cause.message); }
  }

  function stopTyping() {
    window.clearTimeout(typingTimer.current);
    if (activeChat) socketRef.current?.emit('typing:stop', { chatId: activeChat.id });
  }

  function changeDraft(value) {
    setDraft(value);
    if (!activeChat || !socketConnected) return;
    if (value.trim()) socketRef.current?.emit('typing:start', { chatId: activeChat.id });
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(stopTyping, 1200);
  }

  function sendMessage(event) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || !activeChat || !socketConnected) return;
    socketRef.current.emit('message:send', { chatId: activeChat.id, message: { text } }, (result) => {
      if (!result?.ok) setError(result?.error || 'Message could not be sent.');
      else { setDraft(''); stopTyping(); refreshChats(); }
    });
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeChat) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const result = await apiRequest(`/uploads/${file.type.startsWith('image/') ? 'image' : 'file'}`, { method: 'POST', body: formData, token });
      socketRef.current?.emit('message:send', { chatId: activeChat.id, message: { text: '', attachments: [{ url: result.file.url, name: result.file.name, mimeType: result.file.mimeType }] } }, (ack) => {
        if (!ack?.ok) setError(ack?.error || 'Attachment could not be sent.');
        else refreshChats();
      });
    } catch (cause) { setError(cause.message); }
  }

  async function logout() {
    try { await apiRequest('/auth/logout', { method: 'POST', token }); } catch { /* Clear local credentials even if offline. */ }
    authStore.clear();
    socketRef.current?.disconnect();
    setToken(null); setUser(null); setActiveChat(null); setMessages([]); setChats([]);
  }

  async function saveProfile(profile) {
    const result = await apiRequest('/users/me', { method: 'PATCH', body: profile, token });
    setUser(result.user);
    setSettingsOpen(false);
    setToast('Profile updated.');
  }

  if (booting) return <main className="boot-screen"><span className="brand-mark">C</span><span className="spinner" /></main>;
  if (!token || !user) return <AuthScreen onAuthenticated={(nextUser, nextToken) => { setUser(nextUser); setToken(nextToken); }} />;

  return <main className="app-shell">
    <ChatSidebar user={user} chats={chats} visibleChats={visibleChats} matchingPeople={matchingPeople} userMap={userMap} activeChatId={activeChat?.id} unread={unread} online={online} socketConnected={socketConnected} loadingChats={loadingChats} chatSearch={chatSearch} setChatSearch={setChatSearch} filter={filter} setFilter={setFilter} peopleView={peopleView} setPeopleView={setPeopleView} onSelectChat={selectChat} onStartDirect={startDirect} onStartGroup={() => setGroupOpen(true)} profileOpen={profileOpen} setProfileOpen={setProfileOpen} error={error} onDismissError={() => setError('')} />
    <ConversationPanel activeChat={activeChat} user={user} peer={peer} members={members} messages={messages} loadingMessages={loadingMessages} hasMore={hasMore} nextCursor={nextCursor} typingNames={typingNames} socketConnected={socketConnected} messageSearch={messageSearch} setMessageSearch={setMessageSearch} draft={draft} onDraftChange={changeDraft} onSend={sendMessage} onUpload={uploadFile} onLoadOlder={() => nextCursor && fetchMessages(activeChat.id, nextCursor)} onMobileBack={() => activeChat ? setActiveChat(null) : setPeopleView(true)} detailsOpen={detailsOpen} setDetailsOpen={setDetailsOpen} online={online} />
    {profileOpen && <ProfileMenu user={user} onDismiss={() => setProfileOpen(false)} onLogout={logout} onSettings={() => { setProfileOpen(false); setSettingsOpen(true); }} />}
    {settingsOpen && <ProfileSettingsDialog user={user} onClose={() => setSettingsOpen(false)} onSave={saveProfile} />}
    {groupOpen && <GroupDialog users={users} onClose={() => setGroupOpen(false)} onCreate={createGroup} />}
    {toast && <div className="toast-message"><span />{toast}</div>}
  </main>;
}