import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Kanban, Willow } from '@svar-ui/react-kanban';
import '@svar-ui/react-kanban/all.css';
import {
  Activity, ArrowDownUp, ArrowRight, Bell, Check, ChevronDown, CircleHelp,
  Clock3, ExternalLink, FileText, Flame, LayoutDashboard, ListFilter, LogOut,
  MessageCircle, MoreHorizontal, Plus, Search, Send, Settings2, ShieldCheck,
  Sparkles, Trash2, Users, X,
} from 'lucide-react';
import './styles.css';

const WORKSPACE_NAME = 'Bomb site';
const MEMBERS = [
  { id: 'imran', name: 'Imran', email: 'ogungbayiimran@gmail.com', color: '#c45432' },
  { id: 'elijah', name: 'Elijah', email: 'oloyedeelijah23@gmail.com', color: '#3e7890' },
];
const COLUMNS = [
  { id: 'not_started', label: 'Not started' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'response', label: 'Response' },
  { id: 'not_interested', label: 'Not interested / not eligible' },
];
const STATUS_LABELS = Object.fromEntries(COLUMNS.map((c) => [c.id, c.label]));
const OUTCOMES = ['Offer', 'Rejected', 'Interview', 'Waitlisted', 'Other'];
const TYPES = ['Scholarship', 'Internship', 'Fellowship', 'Grant', 'Competition', 'Conference', 'Volunteer', 'Other'];
const EMAIL_TO_MEMBER = Object.fromEntries(MEMBERS.map((m) => [m.email.toLowerCase(), m]));

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [loginEmail, setLoginEmail] = useState(MEMBERS[0].email);
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [member, setMember] = useState(null);
  const [items, setItems] = useState([]);
  const [trackers, setTrackers] = useState([]);
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [activeMember, setActiveMember] = useState(MEMBERS[0].id);
  const [page, setPage] = useState('board');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showOpportunityForm, setShowOpportunityForm] = useState(false);
  const [showResponseForm, setShowResponseForm] = useState(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [commentText, setCommentText] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const channelRef = useRef(null);
  const toastTimer = useRef(null);
  const kanbanApi = useRef(null);

  const notify = useCallback((message) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2800);
  }, []);

  const currentMember = useMemo(() => {
    const email = session?.user?.email?.toLowerCase();
    return EMAIL_TO_MEMBER[email] || null;
  }, [session]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!supabase || !session || !currentMember) return;
    setBusy(true);
    const { error: joinError } = await supabase.rpc('join_bomb_site');
    if (joinError) {
      notify(joinError.message);
      setBusy(false);
      return;
    }
    const results = await Promise.all([
      supabase.from('opportunities').select('*').order('created_at', { ascending: false }),
      supabase.from('trackers').select('*'),
      supabase.from('comments').select('*').order('created_at', { ascending: true }),
      supabase.from('activity').select('*').order('created_at', { ascending: false }).limit(40),
    ]);
    const err = results.find((r) => r.error)?.error;
    if (err) notify(err.message);
    setItems((results[0].data || []).map(mapOpportunity));
    setTrackers(results[1].data || []);
    setComments(results[2].data || []);
    setActivity(results[3].data || []);
    setMember(currentMember);
    setBusy(false);
  }, [session, currentMember, notify]);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  useEffect(() => {
    if (!supabase || !session || !currentMember) return;
    const channel = supabase.channel('bomb-site-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities' }, loadWorkspace)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trackers' }, loadWorkspace)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, loadWorkspace)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity' }, loadWorkspace)
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); channelRef.current = null; };
  }, [session, currentMember, loadWorkspace]);

  useEffect(() => {
    const onOn = () => setOnline(true);
    const onOff = () => setOnline(false);
    window.addEventListener('online', onOn); window.addEventListener('offline', onOff);
    return () => { window.removeEventListener('online', onOn); window.removeEventListener('offline', onOff); };
  }, []);

  const trackersFor = useCallback((oppId) => trackers.filter((t) => t.opportunity_id === oppId), [trackers]);
  const trackerFor = useCallback((oppId, memberId) => trackers.find((t) => t.opportunity_id === oppId && t.member_id === memberId), [trackers]);
  const getComments = useCallback((oppId) => comments.filter((c) => c.opportunity_id === oppId), [comments]);
  const visibleItems = useMemo(() => items.filter((item) => {
    const q = query.trim().toLowerCase();
    const matchesQ = !q || [item.title, item.organization, item.notes, item.location].some((v) => (v || '').toLowerCase().includes(q));
    const matchesType = !typeFilter || item.type === typeFilter;
    return matchesQ && matchesType;
  }), [items, query, typeFilter]);

  const cards = useMemo(() => visibleItems.map((item) => {
    const own = trackerFor(item.id, activeMember);
    return {
      id: item.id,
      label: item.title,
      description: item.organization || '',
      column: own?.status || 'not_started',
      priority: own?.priority === 'High' ? 1 : own?.priority === 'Low' ? 3 : 2,
      deadline: item.deadline ? new Date(`${item.deadline}T00:00:00`) : null,
      type: item.type,
      ...item,
    };
  }), [visibleItems, activeMember, trackerFor]);

  const submitLogin = async (event) => {
    event.preventDefault(); setAuthError(''); setBusy(true);
    if (!supabase) { setAuthError('Supabase is not configured yet. Follow SETUP.md to connect the project.'); setBusy(false); return; }
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    setBusy(false);
    if (error) setAuthError(error.message);
    else setLoginPassword('');
  };

  const signOut = async () => { if (supabase) await supabase.auth.signOut(); setItems([]); setTrackers([]); setComments([]); setActivity([]); };

  const logActivity = async (action, opportunityId, detail = {}) => {
    if (!supabase || !member) return;
    await supabase.from('activity').insert({
      opportunity_id: opportunityId || null,
      actor_id: member.id,
      action,
      detail,
    });
  };

  const createOpportunity = async (data) => {
    if (!supabase || !member) return;
    const { data: created, error } = await supabase.from('opportunities').insert({
      title: data.title,
      organization: data.organization || null,
      type: data.type,
      deadline: data.deadline || null,
      link: data.link || null,
      location: data.location || null,
      notes: data.notes || null,
      created_by: member.id,
    }).select().single();
    if (error) { notify(error.message); return; }
    await logActivity('created', created.id, { title: data.title });
    await loadWorkspace(); setShowOpportunityForm(false); notify('Opportunity added to the shared board');
  };

  const updateTrackerStatus = async (opportunityId, nextStatus) => {
    if (!supabase || !member) return;
    const tracker = trackerFor(opportunityId, activeMember);
    if (!tracker) { notify('Tracker not found for this person'); await loadWorkspace(); return; }
    if (tracker.status === 'response') { notify('Responses are locked once confirmed'); await loadWorkspace(); return; }
    if (nextStatus === 'response') {
      const opportunity = items.find((x) => x.id === opportunityId);
      setShowResponseForm({ opportunityId, title: opportunity?.title || 'Opportunity', tracker });
      await loadWorkspace();
      return;
    }
    const { error } = await supabase.from('trackers').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', tracker.id);
    if (error) notify(error.message);
    else {
      await logActivity('status_changed', opportunityId, { from: tracker.status, to: nextStatus, member_id: activeMember });
      await loadWorkspace();
    }
  };

  const confirmResponse = async (outcome, note) => {
    const pending = showResponseForm;
    if (!pending || !supabase || !member) return;
    if (outcome === 'Rejected' && !note.trim()) { notify('Add a reason for rejection before confirming'); return; }
    const { error } = await supabase.from('trackers').update({
      status: 'response', outcome, response_note: note.trim() || null, locked: true, updated_at: new Date().toISOString(),
    }).eq('id', pending.tracker.id);
    if (error) { notify(error.message); return; }
    await logActivity('response_logged', pending.opportunityId, { outcome, note: note.trim(), member_id: activeMember });
    setShowResponseForm(null); await loadWorkspace(); notify('Response logged and locked');
  };

  const updateOpportunity = async (id, values) => {
    if (!supabase) return;
    const { error } = await supabase.from('opportunities').update({
      title: values.title, organization: values.organization || null, type: values.type,
      deadline: values.deadline || null, link: values.link || null,
      location: values.location || null, notes: values.notes || null,
    }).eq('id', id);
    if (error) notify(error.message);
    else { await logActivity('edited', id, { title: values.title }); await loadWorkspace(); notify('Opportunity updated'); }
  };

  const deleteOpportunity = async (id) => {
    if (!supabase || !window.confirm('Delete this opportunity and both progress trackers?')) return;
    const title = items.find((x) => x.id === id)?.title;
    const { error } = await supabase.from('opportunities').delete().eq('id', id);
    if (error) notify(error.message);
    else { await logActivity('deleted', null, { title }); setSelectedId(null); await loadWorkspace(); notify('Opportunity deleted'); }
  };

  const addComment = async (event) => {
    event.preventDefault();
    if (!supabase || !member || !selectedId || !commentText.trim()) return;
    const { error } = await supabase.from('comments').insert({ opportunity_id: selectedId, author_id: member.id, body: commentText.trim() });
    if (error) notify(error.message);
    else { await logActivity('commented', selectedId, {}); setCommentText(''); await loadWorkspace(); }
  };

  const onMoveCard = async ({ id, column }) => {
    const tracker = trackerFor(String(id), activeMember);
    if (!tracker) { await loadWorkspace(); return; }
    if (tracker.status === 'response') { notify('This response is locked'); await loadWorkspace(); return; }
    if (column === 'response') { await updateTrackerStatus(String(id), 'response'); return; }
    await updateTrackerStatus(String(id), column);
  };

  if (!authReady) return <LoadingScreen />;
  if (!session || !currentMember) {
    return <LoginScreen
      email={loginEmail} setEmail={setLoginEmail} password={loginPassword} setPassword={setLoginPassword}
      onSubmit={submitLogin} error={authError} busy={busy} configured={!!supabase}
    />;
  }
  if (!member) return <LoadingScreen label="Opening Bomb site…" />;

  const selected = items.find((x) => x.id === selectedId);
  const upcomingCount = items.filter((i) => i.deadline && new Date(`${i.deadline}T23:59:59`) >= new Date()).length;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand-lockup">
        <div className="brand-mark"><Flame size={20} strokeWidth={1.8} /></div>
        <div><div className="brand-title">Bomb site</div><div className="brand-sub">THE OPPORTUNITY BOARD</div></div>
        <button className="mobile-close icon-button" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button>
      </div>
      <div className="workspace-pill"><span className="workspace-pulse" /> Shared workspace <ChevronDown size={14} /></div>
      <div className="nav-label">Workspace</div>
      <nav className="side-nav">
        <button className={`nav-link ${page === 'board' ? 'active' : ''}`} onClick={() => { setPage('board'); setMobileNav(false); }}><LayoutDashboard size={17} /> Board <span className="nav-count">{items.length}</span></button>
        <button className={`nav-link ${page === 'activity' ? 'active' : ''}`} onClick={() => { setPage('activity'); setMobileNav(false); }}><Activity size={17} /> Activity</button>
        <button className={`nav-link ${page === 'essays' ? 'active' : ''}`} onClick={() => { setPage('essays'); setMobileNav(false); }}><FileText size={17} /> Essays <span className="coming-soon">soon</span></button>
      </nav>
      <div className="side-divider" />
      <div className="nav-label">Your people</div>
      <div className="member-list">
        {MEMBERS.map((m) => <button key={m.id} className={`member-row ${activeMember === m.id ? 'member-current' : ''}`} onClick={() => setActiveMember(m.id)}>
          <span className="avatar" style={{ '--avatar': m.color }}>{initials(m.name)}</span>
          <span className="member-name">{m.id === member.id ? `${m.name} (you)` : m.name}</span>
          <span className={`member-state ${m.id === member.id ? 'self' : ''}`}>{m.id === member.id ? 'YOU' : ''}</span>
        </button>)}
      </div>
      <div className="sidebar-spacer" />
      <div className="side-deadline-card">
        <div className="deadline-icon"><Clock3 size={17} /></div>
        <div><div className="deadline-big">{upcomingCount}</div><div className="deadline-small">upcoming deadlines</div></div>
        <ArrowRight className="deadline-arrow" size={15} />
      </div>
      <div className="sidebar-bottom">
        <div className="online-state"><span className={`online-dot ${online ? 'online' : ''}`} />{online ? 'Connected' : 'Offline'}</div>
        <button className="profile-button" onClick={signOut} title="Sign out">
          <span className="avatar profile-avatar" style={{ '--avatar': member.color }}>{initials(member.name)}</span>
          <span className="profile-copy"><b>{member.name}</b><small>Member</small></span><LogOut size={15} />
        </button>
      </div>
    </aside>

    {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close menu" />}

    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu icon-button" onClick={() => setMobileNav(true)} aria-label="Open menu"><MoreHorizontal size={20} /></button>
        <div className="crumb"><span>Bomb site</span><span className="crumb-slash">/</span><b>{page === 'board' ? 'Board' : page === 'activity' ? 'Activity' : 'Essays'}</b></div>
        <div className="top-actions">
          <div className="live-badge"><span className={`online-dot ${online ? 'online' : ''}`} />{online ? 'Live sync' : 'Offline'}</div>
          <button className="icon-button notification-button" title="Notifications"><Bell size={17} /><i /></button>
          <button className="top-avatar" style={{ '--avatar': member.color }} title={member.name}>{initials(member.name)}</button>
        </div>
      </header>

      {page === 'board' && <>
        <section className="page-heading">
          <div>
            <div className="section-kicker"><Sparkles size={13} /> SHARED PURSUIT</div>
            <h1>Opportunity board<span className="title-period">.</span></h1>
            <p>One shared list. Two separate journeys. Keep each other moving.</p>
          </div>
          <button className="primary-button" onClick={() => setShowOpportunityForm(true)}><Plus size={17} /> Add opportunity</button>
        </section>

        <section className="board-toolbar">
          <div className="board-view-toggle" role="tablist" aria-label="Progress owner">
            {MEMBERS.map((m) => <button key={m.id} role="tab" aria-selected={activeMember === m.id} className={activeMember === m.id ? 'selected' : ''} onClick={() => setActiveMember(m.id)}>
              <span className="mini-avatar" style={{ '--avatar': m.color }}>{initials(m.name)}</span>{m.id === member.id ? 'My progress' : `${m.name}’s progress`}
            </button>)}
          </div>
          <div className="board-tools-right">
            <label className="search-box"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an opportunity" /></label>
            <label className="filter-select"><ListFilter size={14} /><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="">All types</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</select><ChevronDown size={13} /></label>
            <button className="tool-button" onClick={loadWorkspace} title="Refresh"><ArrowDownUp size={15} /></button>
          </div>
        </section>

        {activeMember !== member.id && <div className="viewing-banner"><ShieldCheck size={15} /> Viewing {MEMBERS.find((m) => m.id === activeMember)?.name}’s progress <span>— changes are attributed to your account.</span></div>}

        <section className="kanban-wrap">
          {busy && !items.length ? <div className="board-loading">Gathering the board…</div> :
            <Willow><Kanban
              cards={cards}
              columns={COLUMNS}
              init={(api) => { kanbanApi.current = api; }}
              onMoveCard={onMoveCard}
              cardContent={({ card }) => <OpportunityCard card={card} trackers={trackersFor(card.id)} comments={getComments(card.id)} activeMember={activeMember} onOpen={() => setSelectedId(String(card.id))} />}
              render={{ columnScroll: true, virtualizeCards: false, estimatedCardHeight: 156 }}
              readonly={false}
            /></Willow>}
          {!visibleItems.length && <div className="board-empty"><div className="empty-stamp"><Search size={21} /></div><b>No opportunities here yet</b><span>Add one to start tracking both journeys.</span><button onClick={() => setShowOpportunityForm(true)}><Plus size={15} /> Add the first one</button></div>}
        </section>
        <div className="board-footnote"><CircleHelp size={14} /><span>Drag cards to update <b>{activeMember === member.id ? 'your' : `${MEMBERS.find((m) => m.id === activeMember)?.name}’s`}</b> progress. Response cards lock after confirmation.</span></div>
      </>}

      {page === 'activity' && <ActivityPage activity={activity} items={items} />}
      {page === 'essays' && <EssaysPlaceholder />}
    </main>

    {selected && <OpportunityDrawer
      item={selected} trackers={trackersFor(selected.id)} member={member} activeMember={activeMember} comments={getComments(selected.id)}
      activity={activity.filter((a) => a.opportunity_id === selected.id)} onClose={() => setSelectedId(null)}
      onSave={(values) => updateOpportunity(selected.id, values)} onDelete={() => deleteOpportunity(selected.id)}
      onComment={addComment} commentText={commentText} setCommentText={setCommentText}
    />}
    {showOpportunityForm && <OpportunityForm onClose={() => setShowOpportunityForm(false)} onSave={createOpportunity} />}
    {showResponseForm && <ResponseForm pending={showResponseForm} onClose={() => setShowResponseForm(null)} onConfirm={confirmResponse} />}
    {toast && <div className="toast"><Check size={15} />{toast}</div>}
  </div>;
}

function mapOpportunity(row) {
  return {
    id: row.id, title: row.title, organization: row.organization || '', type: row.type || 'Other',
    deadline: row.deadline || '', link: row.link || '', location: row.location || '', notes: row.notes || '',
    createdAt: row.created_at,
  };
}

function initials(name) { return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase(); }
function memberById(id) { return MEMBERS.find((m) => m.id === id) || { id, name: 'Member', color: '#777' }; }
function dateLabel(date) {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(+d) ? date : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(d);
}
function since(date) {
  const ms = Date.now() - new Date(date).getTime();
  if (!Number.isFinite(ms)) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now'; if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24); return `${days}d ago`;
}

function OpportunityCard({ card, trackers, comments, activeMember, onOpen }) {
  const active = trackers.find((t) => t.member_id === activeMember);
  const due = card.deadline ? dateLabel(card.deadline) : '';
  const response = active?.status === 'response';
  return <div role="button" tabIndex={0} className={`opp-kanban-card ${response ? 'response-card' : ''}`} onClick={(e) => { e.stopPropagation(); onOpen(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onOpen(); } }}>
    <div className="opp-card-top"><span className="type-tag">{card.type || 'Other'}</span>{response && <span className="locked-tag"><ShieldCheck size={11} /> Locked</span>}</div>
    <h3>{card.title}</h3>
    {card.organization && <div className="opp-card-org">{card.organization}</div>}
    <div className="opp-card-people">{MEMBERS.map((m) => {
      const t = trackers.find((x) => x.member_id === m.id);
      return <div className={`progress-person ${m.id === activeMember ? 'person-active' : ''}`} key={m.id}>
        <span className="mini-avatar" style={{ '--avatar': m.color }}>{initials(m.name)}</span>
        <span className="person-label">{m.name}</span>
        <span className="person-status" title={STATUS_LABELS[t?.status] || 'Not started'}>{t?.status === 'response' ? (t.outcome || 'Response') : STATUS_LABELS[t?.status] || 'Not started'}</span>
      </div>;
    })}</div>
    <div className="opp-card-bottom">
      {due ? <span className="due-label"><Clock3 size={12} />{due}</span> : <span className="due-label no-date">No deadline</span>}
      <span className="comment-count"><MessageCircle size={12} />{comments.length}</span>
    </div>
  </div>;
}

function LoginScreen({ email, setEmail, password, setPassword, onSubmit, error, busy, configured }) {
  return <div className="login-screen">
    <div className="login-art"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-spark">✳</div><div className="art-caption">GOOD THINGS<br />TAKE A LITTLE<br /><em>FOLLOW-THROUGH.</em></div><div className="art-index">B/S — 01</div></div>
    <div className="login-panel"><div className="login-brand"><span className="brand-mark"><Flame size={20} /></span><span>Bomb site</span></div><div className="login-kicker">YOUR SHARED OPPORTUNITY DESK</div><h1>Get in.<br /><em>Get after it.</em></h1><p className="login-copy">A small shared space to find the next thing and actually follow through.</p>
      {!configured && <div className="setup-warning"><ShieldCheck size={17} /><div><b>Backend setup needed</b><span>Connect the Supabase project first; see <code>SETUP.md</code>.</span></div></div>}
      <form onSubmit={onSubmit} className="login-form"><label>Your account</label><select value={email} onChange={(e) => setEmail(e.target.value)}>{MEMBERS.map((m) => <option value={m.email} key={m.id}>{m.name} · {m.email}</option>)}</select><label>Password</label><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your shared password" required /><button type="submit" disabled={busy}>{busy ? 'Opening…' : 'Enter the workspace'}<ArrowRight size={16} /></button>{error && <div className="auth-error">{error}</div>}</form>
      <div className="login-secure"><ShieldCheck size={14} /> Private to the two of you · encrypted in transit</div>
    </div>
  </div>;
}

function LoadingScreen({ label = 'Warming up your desk…' }) { return <div className="loading-screen"><div className="loader-flame"><Flame size={23} /></div><span>{label}</span></div>; }

function OpportunityForm({ onClose, onSave }) {
  const [form, setForm] = useState({ title: '', organization: '', type: 'Scholarship', deadline: '', link: '', location: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (e) => { e.preventDefault(); if (!form.title.trim()) return; setSaving(true); await onSave({ ...form, title: form.title.trim() }); setSaving(false); };
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="modal-card" onSubmit={submit}>
    <div className="modal-head"><div><span className="section-kicker">SHARED LIST</span><h2>Add an opportunity</h2><p>It’ll appear for both of you, with separate progress trackers.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div>
    <div className="form-grid"><label className="field full">Opportunity name<input autoFocus value={form.title} onChange={set('title')} placeholder="e.g. Jim Ovia Foundation Scholarship" required /></label><label className="field">Organisation<input value={form.organization} onChange={set('organization')} placeholder="Who’s offering it?" /></label><label className="field">Type<select value={form.type} onChange={set('type')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label><label className="field">Deadline<input type="date" value={form.deadline} onChange={set('deadline')} /></label><label className="field">Location<input value={form.location} onChange={set('location')} placeholder="Remote, Nigeria…" /></label><label className="field full">Link<input type="url" value={form.link} onChange={set('link')} placeholder="https://…" /></label><label className="field full">Notes<textarea value={form.notes} onChange={set('notes')} rows="3" placeholder="Requirements, who shared it, anything worth remembering…" /></label></div>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : <><Plus size={16} /> Add to board</>}</button></div>
  </form></div>;
}

function ResponseForm({ pending, onClose, onConfirm }) {
  const [outcome, setOutcome] = useState('Offer');
  const [note, setNote] = useState('');
  const rejected = outcome === 'Rejected';
  return <div className="overlay response-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="modal-card response-modal" onSubmit={(e) => { e.preventDefault(); onConfirm(outcome, note); }}>
    <div className="response-stamp"><ShieldCheck size={19} /></div><button type="button" className="icon-button response-close" onClick={onClose}><X size={17} /></button>
    <span className="section-kicker">CLOSE THE LOOP</span><h2>Log their response</h2><p className="response-opportunity">{pending.title}</p><div className="lock-explainer"><ShieldCheck size={15} /><span>Confirming locks <b>your progress</b> on this opportunity. You can still read it and comment.</span></div>
    <label className="field">What did they say?<select value={outcome} onChange={(e) => setOutcome(e.target.value)}>{OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select></label>
    <label className="field response-note">{rejected ? 'Reason for rejection (required)' : 'Note (optional)'}<textarea autoFocus={rejected} value={note} onChange={(e) => setNote(e.target.value)} rows="3" required={rejected} placeholder={rejected ? 'Add the reason so you both know for next time…' : 'Any useful details, dates or next steps…'} /></label>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Keep it open</button><button className="primary-button" disabled={rejected && !note.trim()}><ShieldCheck size={16} /> Confirm &amp; lock</button></div>
  </form></div>;
}

function OpportunityDrawer({ item, trackers, member, activeMember, comments, activity, onClose, onSave, onDelete, onComment, commentText, setCommentText }) {
  const activeTracker = trackers.find((t) => t.member_id === activeMember);
  const responseLocked = activeTracker?.status === 'response';
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(item);
  useEffect(() => { setForm(item); setEditing(false); }, [item.id]);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = (e) => { e.preventDefault(); onSave(form); setEditing(false); };
  return <div className="drawer-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><aside className="detail-drawer">
    <div className="drawer-topline"><span className="drawer-kind">{item.type || 'Opportunity'}</span><div className="drawer-actions"><button className="icon-button" title={responseLocked ? 'This progress is locked' : 'Edit'} disabled={responseLocked} onClick={() => setEditing((v) => !v)}><Settings2 size={17} /></button><button className="icon-button danger-icon" title="Delete" onClick={onDelete}><Trash2 size={16} /></button><button className="icon-button" onClick={onClose}><X size={18} /></button></div></div>
    {editing ? <form onSubmit={submit} className="drawer-edit"><h2>Edit opportunity</h2><label className="field">Title<input value={form.title} onChange={set('title')} required /></label><label className="field">Organisation<input value={form.organization} onChange={set('organization')} /></label><div className="form-grid"><label className="field">Type<select value={form.type} onChange={set('type')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label><label className="field">Deadline<input type="date" value={form.deadline} onChange={set('deadline')} /></label></div><label className="field">Location<input value={form.location} onChange={set('location')} /></label><label className="field">Link<input type="url" value={form.link} onChange={set('link')} /></label><label className="field">Notes<textarea rows="4" value={form.notes} onChange={set('notes')} /></label><div className="drawer-edit-actions"><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Cancel</button><button className="primary-button"><Check size={15} /> Save</button></div></form> : <>
      <div className="drawer-title-wrap"><h1>{item.title}</h1>{item.organization && <div className="drawer-org">{item.organization}</div>}</div>
      <div className="drawer-meta">{item.deadline && <span><Clock3 size={14} /> Due {dateLabel(item.deadline)}</span>}{item.location && <span>{item.location}</span>}{item.link && <a href={item.link} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Opportunity page</a>}</div>
      {item.notes && <div className="drawer-note"><span className="drawer-label">NOTES</span><p>{item.notes}</p></div>}
      <section className="drawer-section"><div className="drawer-section-head"><div><span className="drawer-label">TWO SEPARATE JOURNEYS</span><h3>Progress</h3></div><Users size={17} /></div><div className="tracker-stack">{MEMBERS.map((m) => {
        const tracker = trackers.find((t) => t.member_id === m.id);
        return <div className="tracker-detail" key={m.id}><div className="tracker-detail-head"><span className="avatar" style={{ '--avatar': m.color }}>{initials(m.name)}</span><div className="tracker-person-copy"><b>{m.id === member.id ? `${m.name} (you)` : m.name}</b><span>{STATUS_LABELS[tracker?.status] || 'Not started'}</span></div>{tracker?.status === 'response' && <span className="locked-tag"><ShieldCheck size={11} /> Locked</span>}</div>
          {tracker?.status === 'response' && <div className="response-receipt"><span className="outcome-pill">{tracker.outcome || 'Response'}</span>{tracker.response_note && <p>{tracker.response_note}</p>}</div>}
          {tracker?.status === 'not_interested' && tracker.response_note && <div className="response-receipt"><span className="outcome-pill muted-pill">Passed</span><p>{tracker.response_note}</p></div>}
          {tracker?.date_applied && <div className="tracker-detail-foot">Submitted {dateLabel(tracker.date_applied)}</div>}
        </div>;
      })}</div></section>
      <section className="drawer-section comment-section"><div className="drawer-section-head"><div><span className="drawer-label">KEEP EACH OTHER IN THE LOOP</span><h3>Comments <span className="comment-total">{comments.length}</span></h3></div><MessageCircle size={17} /></div>
        <div className="comment-list">{comments.length ? comments.map((c) => { const m = memberById(c.author_id); return <div className="comment" key={c.id}><span className="avatar comment-avatar" style={{ '--avatar': m.color }}>{initials(m.name)}</span><div className="comment-body"><div className="comment-by"><b>{m.name}</b><time>{since(c.created_at)}</time></div><p>{c.body}</p></div></div>; }) : <div className="no-comments">No comments yet. Share a thought or offer to review.</div>}</div>
        <form className="comment-form" onSubmit={onComment}><input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Write a comment…" /><button disabled={!commentText.trim()} aria-label="Send comment"><Send size={16} /></button></form>
      </section>
      <section className="drawer-section drawer-activity"><span className="drawer-label">RECENT ACTIVITY</span>{activity.slice(0, 4).length ? activity.slice(0, 4).map((a) => <ActivityLine key={a.id} entry={a} />) : <div className="activity-empty">No activity logged yet.</div>}</section>
    </>}
  </aside></div>;
}

function ActivityPage({ activity, items }) {
  return <div className="activity-page"><div className="section-kicker"><Activity size={13} /> SHARED HISTORY</div><h1>Activity<span className="title-period">.</span></h1><p className="activity-intro">A running log of your shared momentum.</p><div className="activity-timeline">{activity.length ? activity.map((a) => <ActivityLine key={a.id} entry={a} item={items.find((i) => i.id === a.opportunity_id)} large />) : <div className="activity-empty large-empty"><Sparkles size={20} /><b>Nothing on the record yet</b><span>Adding, moving and commenting will show up here.</span></div>}</div></div>;
}
function ActivityLine({ entry, item, large = false }) {
  const who = memberById(entry.actor_id);
  const detail = entry.detail || {};
  let phrase = 'updated an opportunity';
  if (entry.action === 'created') phrase = `added “${detail.title || item?.title || 'an opportunity'}”`;
  else if (entry.action === 'edited') phrase = `updated “${detail.title || item?.title || 'an opportunity'}”`;
  else if (entry.action === 'deleted') phrase = `removed “${detail.title || 'an opportunity'}”`;
  else if (entry.action === 'commented') phrase = `left a comment on “${item?.title || 'an opportunity'}”`;
  else if (entry.action === 'status_changed') phrase = `moved ${detail.member_id === 'elijah' ? 'Elijah’s' : 'Imran’s'} “${item?.title || 'opportunity'}” to ${STATUS_LABELS[detail.to] || detail.to}`;
  else if (entry.action === 'response_logged') phrase = `logged a ${detail.outcome || 'response'} for “${item?.title || 'an opportunity'}”`;
  return <div className={`activity-line ${large ? 'activity-line-large' : ''}`}><span className="activity-avatar avatar" style={{ '--avatar': who.color }}>{initials(who.name)}</span><div className="activity-copy"><p><b>{who.name}</b> {phrase}</p>{entry.action === 'response_logged' && detail.note && <div className="activity-note">“{detail.note}”</div>}<time>{since(entry.created_at)}</time></div><span className={`activity-kind kind-${entry.action}`}>{entry.action === 'status_changed' ? 'STATUS' : entry.action === 'response_logged' ? 'RESPONSE' : entry.action === 'commented' ? 'COMMENT' : 'UPDATE'}</span></div>;
}
function EssaysPlaceholder() { return <div className="coming-page"><div className="coming-icon"><FileText size={20} /></div><span className="section-kicker">ON THE LIST</span><h1>Essays &amp; drafts<span className="title-period">.</span></h1><p>We’ll give your essays their own home after the shared board is humming. For now, keep drafts in your existing documents and link them from an opportunity’s notes.</p><span className="coming-ribbon">COMING IN A NEXT PASS</span></div>; }

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
