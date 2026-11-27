import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Kanban, Willow } from '@svar-ui/react-kanban';
import '@svar-ui/react-kanban/all.css';
import {
  Activity, ArrowRight, Check, ChevronDown, CircleHelp, Clock3,
  ExternalLink, FileText, ListFilter, Lock, LogOut, MessageCircle,
  Plus, RefreshCw, Search, Send, Settings2, Trash2, Users, X,
} from 'lucide-react';
import './styles.css';

const WORKSPACE_NAME = 'Coffer';
const WORKSPACE_ID = 'e72ec8e1-640b-4e58-b474-902691a1c3df';
const MEMBERS = [
  { id: 'imran', name: 'Imran', email: 'ogungbayiimran@gmail.com' },
  { id: 'elijah', name: 'Elijah', email: 'oloyedeelijah23@gmail.com' },
];
const COLUMNS = [
  { id: 'not_started', label: 'Not started', addCard: false },
  { id: 'in_progress', label: 'In progress', addCard: false },
  { id: 'submitted', label: 'Submitted', addCard: false },
  { id: 'response', label: 'Response', addCard: false },
  { id: 'not_interested', label: 'Not interested / not eligible', addCard: false },
];
const STATUS_LABELS = Object.fromEntries(COLUMNS.map((c) => [c.id, c.label]));
const OUTCOMES = ['Offer', 'Rejected', 'Interview', 'Waitlisted', 'Other'];
const TYPES = ['Scholarship', 'Internship', 'Fellowship', 'Grant', 'Competition', 'Conference', 'Volunteer', 'Other'];
const EMAIL_TO_MEMBER = Object.fromEntries(MEMBERS.map((m) => [m.email.toLowerCase(), m]));
const NAV = [
  { id: 'board', label: 'Board' },
  { id: 'activity', label: 'Activity' },
  { id: 'essays', label: 'Essays' },
];

const BTN = 'inline-flex items-center justify-center gap-2 rounded-full border border-transparent text-[0.9375rem] leading-none whitespace-nowrap transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:translate-x-0.5 hover:[&_svg]:-translate-y-0.5';
const BTN_SOLID = `${BTN} bg-ink px-5 py-3 text-paper hover:bg-[#2b2b2b]`;
const BTN_GHOST = `${BTN} border-line px-5 py-3 text-ink hover:border-ink`;
const BTN_SM = 'px-4 py-2.5 text-[11px]';
const ICON_BTN = 'grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-40';
const EYEBROW = 'font-pixel text-[11px] leading-none uppercase tracking-[0.12em] text-muted';
const FIELD = 'grid gap-1 text-[11px] text-muted';
const INPUT = 'w-full border-0 border-b border-line bg-transparent py-2.5 text-[11px] text-ink outline-none transition-colors placeholder:text-faint focus:border-ink';
const AVATAR = 'grid size-7 shrink-0 place-items-center rounded-full bg-ink font-pixel text-[11px] text-paper';
const AVATAR_GHOST = `${AVATAR} border border-line bg-transparent text-ink`;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function statusPillClass(status, inline = false) {
  const base = 'overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-2.5 py-1 font-pixel text-[11px] uppercase leading-[1.3] tracking-[0.05em] text-white';
  const placement = inline ? 'ml-0 max-w-full' : 'ml-auto max-w-[62%]';
  const colors = {
    not_started: 'bg-neutral-500',
    in_progress: 'bg-blue-600',
    submitted: 'bg-violet-600',
    response: 'bg-emerald-600',
    not_interested: 'bg-rose-600',
  };
  return `${base} ${placement} ${colors[status] || colors.not_started}`;
}

function typeTagClass(type) {
  const colors = {
    Scholarship: 'bg-purple-700',
    Internship: 'bg-blue-700',
    Fellowship: 'bg-indigo-700',
    Grant: 'bg-green-700',
    Competition: 'bg-red-700',
    Conference: 'bg-cyan-700',
    Volunteer: 'bg-emerald-700',
  };
  return `text-white ${colors[type] || 'bg-neutral-700'}`;
}

function outcomeTagClass(outcome) {
  if (outcome === 'Offer') return 'bg-green-700 text-white';
  if (outcome === 'Rejected') return 'bg-red-700 text-white';
  if (outcome === 'Interview') return 'bg-blue-700 text-white';
  if (outcome === 'Waitlisted') return 'bg-purple-700 text-white';
  return 'bg-neutral-700 text-white';
}

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
  const channelRef = useRef(null);
  const toastTimer = useRef(null);

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

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [page]);

  const trackersFor = useCallback((oppId) => trackers.filter((t) => t.opportunity_id === oppId), [trackers]);
  const trackerFor = useCallback((oppId, memberId) => trackers.find((t) => t.opportunity_id === oppId && t.member_id === memberId), [trackers]);
  const getComments = useCallback((oppId) => comments.filter((c) => c.opportunity_id === oppId), [comments]);

  const teammate = useMemo(
    () => MEMBERS.find((m) => m.id !== member?.id) || MEMBERS[1],
    [member],
  );

  const visibleItems = useMemo(() => items.filter((item) => {
    const q = query.trim().toLowerCase();
    const matchesQ = !q || [item.title, item.organization, item.notes, item.location].some((v) => (v || '').toLowerCase().includes(q));
    const matchesType = !typeFilter || item.type === typeFilter;
    return matchesQ && matchesType;
  }), [items, query, typeFilter]);

  const cards = useMemo(() => visibleItems.map((item) => {
    const own = trackerFor(item.id, member?.id);
    return {
      id: item.id,
      label: item.title,
      description: item.organization || '',
      column: own?.status || 'not_started',
      deadline: item.deadline ? new Date(`${item.deadline}T00:00:00`) : null,
      type: item.type,
      ...item,
    };
  }), [visibleItems, member, trackerFor]);

  const ownCounts = useMemo(() => countTrackers(trackers, member?.id), [trackers, member]);
  const teammateCounts = useMemo(() => countTrackers(trackers, teammate?.id), [trackers, teammate]);

  const upcomingCount = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return items.filter((i) => i.deadline && new Date(`${i.deadline}T00:00:00`) >= today).length;
  }, [items]);

  const submitLogin = async (event) => {
    event.preventDefault(); setAuthError(''); setBusy(true);
    if (!supabase) { setAuthError('Supabase is not configured yet. Follow SETUP.md to connect the project.'); setBusy(false); return; }
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    setBusy(false);
    if (error) setAuthError(error.message);
    else setLoginPassword('');
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setMember(null); setItems([]); setTrackers([]); setComments([]); setActivity([]);
  };

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
      workspace_id: WORKSPACE_ID,
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
    const tracker = trackerFor(opportunityId, member.id);
    if (!tracker) { notify('Tracker not found for this person'); await loadWorkspace(); return; }
    if (tracker.status === 'response') { notify('Responses are locked once confirmed'); await loadWorkspace(); return; }
    if (tracker.status === nextStatus) return;
    if (nextStatus === 'response') {
      const opportunity = items.find((x) => x.id === opportunityId);
      setShowResponseForm({ opportunityId, title: opportunity?.title || 'Opportunity', tracker });
      await loadWorkspace();
      return;
    }
    const { error } = await supabase.from('trackers').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', tracker.id);
    if (error) notify(error.message);
    else {
      await logActivity('status_changed', opportunityId, { from: tracker.status, to: nextStatus, member_id: member.id });
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
    await logActivity('response_logged', pending.opportunityId, { outcome, note: note.trim(), member_id: member.id });
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
    const tracker = trackerFor(String(id), member?.id);
    if (!tracker) { await loadWorkspace(); return; }
    if (tracker.status === 'response') { notify('This response is locked'); await loadWorkspace(); return; }
    if (column === 'response') { await updateTrackerStatus(String(id), 'response'); return; }
    await updateTrackerStatus(String(id), column);
  };

  if (!authReady) return <LoadingScreen />;
  if (!session || !currentMember) {
    return <LoginScreen
      email={loginEmail} setEmail={setLoginEmail} password={loginPassword} setPassword={setLoginPassword}
      onSubmit={submitLogin} error={authError} busy={busy}
    />;
  }
  if (!member) return <LoadingScreen label="Opening Coffer…" />;

  const selected = items.find((x) => x.id === selectedId);
  const stats = [
    { value: items.length, label: 'Opportunities' },
    { value: upcomingCount, label: 'Upcoming deadlines' },
    { value: ownCounts.in_progress, label: 'Yours in progress' },
    { value: ownCounts.submitted, label: 'Yours submitted' },
  ];

  return <div className="min-h-screen">
    <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[100rem] items-center gap-5 px-[var(--gutter)] sm:gap-8">
        <button className="flex items-center gap-2.5 bg-transparent p-0" onClick={() => setPage('board')} aria-label="Coffer — board">
          <img className="size-8 object-contain" src="/coffer-logo.webp" alt="" />
          <span className="hidden text-[0.95rem] font-medium tracking-[-0.02em] sm:inline">{WORKSPACE_NAME}</span>
        </button>
        <nav className="flex h-full items-center gap-5 sm:gap-7" aria-label="Primary">
          {NAV.map((item) => <button
            key={item.id}
            className={`relative flex h-full items-center bg-transparent p-0 text-[11px] transition-colors sm:text-sm ${page === item.id
              ? 'text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-current'
              : 'text-muted hover:text-ink'}`}
            aria-current={page === item.id ? 'page' : undefined}
            onClick={() => setPage(item.id)}
          >{item.label}</button>)}
        </nav>
        <div className="ml-auto flex items-center gap-2.5 sm:gap-4">
          <span className="flex items-center gap-1.5 font-pixel text-[11px] uppercase tracking-[0.1em] text-faint sm:text-[11px]">
            <i className={`size-1.5 rounded-full ${online ? 'bg-ink' : 'bg-[#c9c9c9]'}`} />{online ? 'Live' : 'Offline'}
          </span>
          <span className="flex items-center gap-2" title={member.email}>
            <span className={AVATAR}>{initials(member.name)}</span>
            <span className="hidden text-[0.85rem] text-muted md:inline">{member.name}</span>
          </span>
          <button className={ICON_BTN} onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-[100rem] px-[var(--gutter)] pb-20">
      {page === 'board' && <>
        <section className="flex flex-col items-start justify-between gap-5 pt-10 pb-8 md:flex-row md:items-end md:pt-[clamp(2.5rem,5vw,4.5rem)]">
          <div>
            <p className={EYEBROW}>Coffer — shared desk</p>
            <h1 className="mt-2.5 mb-2 text-[clamp(2.4rem,5vw,4.25rem)] font-medium leading-[0.95] tracking-[-0.05em] text-balance">Opportunity board<span className="font-serif font-normal italic">.</span></h1>
            <p className="max-w-[52ch] text-[clamp(0.95rem,1.2vw,1.05rem)] tracking-[-0.01em] text-muted">One shared list, two separate journeys. Move your own card; keep an eye on {teammate.name}’s.</p>
          </div>
          <button className={`${BTN_SOLID} w-full md:w-auto`} onClick={() => setShowOpportunityForm(true)}><Plus size={16} /> Add opportunity</button>
        </section>

        <section className="grid grid-cols-2 border-y border-line lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(230px,1.35fr)]" aria-label="Board summary">
          {stats.map((stat, i) => <div key={stat.label} className={`border-line py-4 px-4 lg:py-5 ${i % 2 === 0 ? 'border-r' : ''} ${i >= 2 ? 'border-t lg:border-t-0' : ''} ${i === 0 ? 'lg:pl-0' : ''} ${i > 0 && i < 3 ? 'lg:pl-6' : ''} ${i < 3 ? 'lg:border-r' : ''}`}>
            <span className="block text-[clamp(1.9rem,3vw,2.75rem)] font-medium leading-none tracking-[-0.05em]">{stat.value}</span>
            <span className="mt-2 block font-pixel text-[11px] uppercase tracking-[0.1em] text-faint">{stat.label}</span>
          </div>)}
          <div className="col-span-2 border-t border-line py-4 lg:col-span-1 lg:py-5 lg:pl-6">
            <p className={EYEBROW}>Watching with</p>
            <p className="mt-2 mb-1 text-[1.05rem] font-medium tracking-[-0.02em]">{teammate.name}</p>
          <p className="text-[11px] leading-relaxed text-muted">{teammateCounts.in_progress} in progress · {teammateCounts.submitted} submitted · {teammateCounts.response} responded</p>
          </div>
        </section>

        <section className="flex flex-col items-stretch justify-between gap-3 py-5 md:flex-row md:items-center">
          <label className="flex w-full items-center gap-2 border-b border-line py-2 text-faint transition-colors focus-within:border-ink md:w-[320px]">
            <Search size={15} />
            <input className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-faint" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an opportunity" aria-label="Search opportunities" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <label className="flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-muted">
              <ListFilter size={14} />
              <select className="cursor-pointer appearance-none border-0 bg-transparent text-[11px] text-ink outline-none" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type"><option value="">All types</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              <ChevronDown size={13} />
            </label>
            <button className={`${BTN_GHOST} ${BTN_SM}`} onClick={loadWorkspace} disabled={busy}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Refresh</button>
          </div>
        </section>

        <section className="kanban-shell relative min-h-[560px]" aria-label="Opportunity board">
          {busy && !items.length ? <div className="board-loading grid min-h-[300px] place-items-center font-pixel text-[11px] uppercase tracking-[0.1em] text-faint">Gathering the board…</div> :
            <Willow><Kanban
              cards={cards}
              columns={COLUMNS}
              onMoveCard={onMoveCard}
              cardContent={({ card }) => <OpportunityCard card={card} trackers={trackersFor(card.id)} comments={getComments(card.id)} member={member} teammate={teammate} onOpen={() => setSelectedId(String(card.id))} />}
              render={{ columnScroll: true, virtualizeCards: false, estimatedCardHeight: 172 }}
              readonly={false}
            /></Willow>}
          {!visibleItems.length && <div className="board-empty absolute left-1/2 top-[22%] z-[4] w-[min(330px,calc(100%_-_2rem))] -translate-x-1/2 rounded-2xl border border-dashed border-line bg-paper p-6 text-center shadow-[0_18px_50px_rgba(10,10,10,0.06)]">
            <div className="mx-auto mb-1.5 grid size-9 place-items-center rounded-full border border-line text-muted"><Search size={18} /></div>
            <b className="block text-base font-medium tracking-[-0.02em]">No opportunities here yet</b>
            <span className="mt-1 block text-[11px] text-muted">Add one and both journeys start from the same card.</span>
            <button className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium underline underline-offset-4" onClick={() => setShowOpportunityForm(true)}><Plus size={14} /> Add the first one</button>
          </div>}
        </section>

        <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-faint [&_svg]:mt-0.5 [&_svg]:shrink-0"><CircleHelp size={14} /><span>Drag your own cards to move your progress. {teammate.name}’s status rides along on every card, and yours shows on their board too. Responses lock after confirmation.</span></p>
      </>}

      {page === 'activity' && <ActivityPage activity={activity} items={items} />}
      {page === 'essays' && <EssaysPlaceholder />}
    </main>

    {selected && <OpportunityDrawer
      item={selected} trackers={trackersFor(selected.id)} member={member} teammate={teammate} comments={getComments(selected.id)}
      activity={activity.filter((a) => a.opportunity_id === selected.id)} onClose={() => setSelectedId(null)}
      onSave={(values) => updateOpportunity(selected.id, values)} onDelete={() => deleteOpportunity(selected.id)}
      onComment={addComment} commentText={commentText} setCommentText={setCommentText}
    />}
    {showOpportunityForm && <OpportunityForm onClose={() => setShowOpportunityForm(false)} onSave={createOpportunity} />}
    {showResponseForm && <ResponseForm pending={showResponseForm} onClose={() => setShowResponseForm(null)} onConfirm={confirmResponse} />}
    {toast && <div className="fixed right-5 bottom-5 z-[80] flex items-center gap-2 rounded-full border border-white/10 bg-ink px-4 py-3 text-[11px] text-paper shadow-[0_14px_40px_rgba(10,10,10,0.2)] animate-[toast-in_0.22s_ease-out] max-sm:inset-x-4 max-sm:bottom-4 max-sm:justify-center [&_svg]:text-white/70"><Check size={15} />{toast}</div>}
  </div>;
}

function countTrackers(trackers, memberId) {
  const counts = { not_started: 0, in_progress: 0, submitted: 0, response: 0, not_interested: 0 };
  if (!memberId) return counts;
  trackers.filter((t) => t.member_id === memberId).forEach((t) => {
    if (counts[t.status] !== undefined) counts[t.status] += 1;
  });
  return counts;
}

function mapOpportunity(row) {
  return {
    id: row.id, title: row.title, organization: row.organization || '', type: row.type || 'Other',
    deadline: row.deadline || '', link: row.link || '', location: row.location || '', notes: row.notes || '',
    createdAt: row.created_at,
  };
}

function initials(name) { return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase(); }
function memberById(id) { return MEMBERS.find((m) => m.id === id) || { id, name: 'Member' }; }
function statusLabel(tracker) {
  if (!tracker) return 'Not started';
  if (tracker.status === 'response') return tracker.outcome || 'Response';
  return STATUS_LABELS[tracker.status] || 'Not started';
}
function dateLabel(date) {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(+d) ? date : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(d);
}
function isDueSoon(date) {
  if (!date) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(`${date}T00:00:00`);
  const days = Math.round((due - today) / 86400000);
  return days >= 0 && days <= 7;
}
function since(date) {
  const ms = Date.now() - new Date(date).getTime();
  if (!Number.isFinite(ms)) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now'; if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24); return `${days}d ago`;
}

function OpportunityCard({ card, trackers, comments, member, teammate, onOpen }) {
  const own = trackers.find((t) => t.member_id === member.id);
  const theirs = trackers.find((t) => t.member_id === teammate.id);
  const locked = own?.status === 'response';
  const due = card.deadline ? dateLabel(card.deadline) : '';
  return <div
    role="button" tabIndex={0}
    className={`block w-full rounded-[10px] px-[0.95rem] py-3.5 text-left transition duration-200 hover:-translate-y-px hover:shadow-[0_5px_18px_rgba(10,10,10,0.07)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${locked ? 'bg-neutral-50' : 'bg-paper'}`}
    onClick={(e) => { e.stopPropagation(); onOpen(); }}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onOpen(); } }}
  >
    <div className="flex items-center justify-between gap-2">
      <span className={`rounded-full px-2.5 py-1 font-pixel text-[11px] uppercase tracking-[0.08em] ${typeTagClass(card.type)}`}>{card.type || 'Other'}</span>
        {locked && <span className="flex items-center gap-1 rounded-full bg-emerald-700 px-2.5 py-1 font-pixel text-[11px] uppercase tracking-[0.06em] text-white"><Lock size={11} /> Locked</span>}
    </div>
    <h3 className="mt-2 mb-0.5 text-[0.95rem] font-medium leading-[1.32] tracking-[-0.015em]">{card.title}</h3>
    {card.organization && <p className="m-0 text-[11px] leading-snug text-muted">{card.organization}</p>}
    <div className="mt-3 grid gap-1.5 pt-3">
      <ProgressPerson person={member} tracker={own} you />
      <ProgressPerson person={teammate} tracker={theirs} />
    </div>
    <div className="mt-3 flex items-center justify-between pt-2.5 font-pixel text-[11px] uppercase tracking-[0.05em] text-faint">
      <span className={`flex items-center gap-1 ${isDueSoon(card.deadline) ? 'text-ink' : ''}`}>{due ? <><Clock3 size={11} />{due}</> : 'No deadline'}</span>
      <span className="flex items-center gap-1"><MessageCircle size={11} />{comments.length}</span>
    </div>
  </div>;
}

function ProgressPerson({ person, tracker, you = false }) {
  return <div className="flex min-w-0 items-center gap-2">
    <span className={`w-[54px] shrink-0 font-pixel text-[11px] uppercase tracking-[0.08em] ${you ? 'text-ink' : 'text-faint'}`}>{you ? 'You' : person.name}</span>
    <span className={statusPillClass(tracker?.status || 'not_started')}>{statusLabel(tracker)}</span>
  </div>;
}

function LoginScreen({ email, setEmail, password, setPassword, onSubmit, error, busy }) {
  return <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
    <aside className="relative flex min-h-[280px] flex-col justify-between overflow-hidden bg-ink p-6 text-paper sm:p-10 lg:min-h-screen lg:p-[clamp(2rem,4vw,3.5rem)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(155deg,#000_0%,transparent_78%)]" />
      <div className="relative flex items-center gap-2.5 text-[0.9rem] font-medium"><img className="size-8 object-contain invert" src="/coffer-logo.webp" alt="" /><span>Coffer</span></div>
      <div className="relative max-w-[34rem]">
        <p className="font-pixel text-[11px] leading-none uppercase tracking-[0.12em] text-white/55">A shared opportunity desk</p>
        <h1 className="mt-4 mb-5 text-[clamp(2.9rem,5.6vw,5.6rem)] font-medium leading-[0.9] tracking-[-0.06em]">Two people.<br />One list.<br /><em className="font-serif font-normal italic tracking-[-0.04em] text-white/60">Follow through.</em></h1>
        <p className="max-w-[36ch] text-[0.95rem] leading-[1.65] text-white/60">A small private space to find the next thing, track it honestly, and keep each other moving.</p>
      </div>
      <div className="relative flex justify-between gap-4 font-pixel text-[11px] uppercase tracking-[0.1em] text-white/45"><span>Private to two accounts</span><span>Coffer — 01</span></div>
    </aside>
    <main className="flex items-center justify-center p-6 sm:p-10 lg:p-[clamp(1.5rem,4vw,3.5rem)]">
      <div className="w-full max-w-[390px]">
        <div className="flex items-center gap-2 text-[0.95rem] font-medium"><img className="size-8 object-contain" src="/coffer-logo.webp" alt="" /><span>Coffer</span></div>
        <p className={`${EYEBROW} mt-10`}>Sign in</p>
        <h2 className="mt-2.5 mb-2.5 text-[clamp(2rem,3.5vw,3rem)] font-medium leading-[0.98] tracking-[-0.045em]">Get in.<br />Get after it.</h2>
        <p className="text-[11px] leading-[1.65] text-muted">Use your own account. The board is shared; your progress is yours.</p>
        <form onSubmit={onSubmit} className="mt-8 grid gap-3.5">
          <label className="grid gap-1.5 text-[11px] text-muted">Your account<select className="w-full border-0 border-b border-line bg-transparent py-2.5 text-[0.9rem] text-ink outline-none transition-colors focus:border-ink" value={email} onChange={(e) => setEmail(e.target.value)}>{MEMBERS.map((m) => <option value={m.email} key={m.id}>{m.name} · {m.email}</option>)}</select></label>
          <label className="grid gap-1.5 text-[11px] text-muted">Password<input type="password" autoComplete="current-password" className="w-full border-0 border-b border-line bg-transparent py-2.5 text-[0.9rem] text-ink outline-none transition-colors focus:border-ink" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required /></label>
          <button type="submit" className={`${BTN_SOLID} mt-2 w-full`} disabled={busy}>{busy ? 'Opening…' : 'Enter the workspace'}<ArrowRight size={16} /></button>
          {error && <div className="text-[11px] leading-relaxed">{error}</div>}
        </form>
        <div className="mt-5 flex items-center gap-1.5 text-[11px] text-faint"><Lock size={12} /> Private to the two of you · encrypted in transit</div>
      </div>
    </main>
  </div>;
}

function LoadingScreen({ label = 'Warming up your desk…' }) {
  return <div className="grid min-h-screen place-content-center justify-items-center gap-3.5 bg-paper"><img className="size-12 animate-pulse object-contain" src="/coffer-logo.webp" alt="" /><span className="font-pixel text-[11px] uppercase tracking-[0.1em] text-faint">{label}</span></div>;
}

function OpportunityForm({ onClose, onSave }) {
  const [form, setForm] = useState({ title: '', organization: '', type: 'Scholarship', deadline: '', link: '', location: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (e) => { e.preventDefault(); if (!form.title.trim()) return; setSaving(true); await onSave({ ...form, title: form.title.trim() }); setSaving(false); };
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/30 p-5 backdrop-blur animate-[fade-in_0.16s_ease]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="relative max-h-[calc(100vh-2.5rem)] w-full max-w-[600px] overflow-auto rounded-[18px] border border-line bg-paper p-5 shadow-[0_30px_90px_rgba(10,10,10,0.18)] animate-[modal-in_0.2s_ease-out] sm:p-6" onSubmit={submit}>
    <div className="mb-5 flex justify-between gap-4"><div><p className={EYEBROW}>Shared list</p><h2 className="mt-1.5 text-[1.65rem] font-medium tracking-[-0.04em]">Add an opportunity</h2><p className="mt-0.5 text-[0.82rem] text-muted">It appears for both of you, with a separate tracker each.</p></div><button type="button" className={ICON_BTN} onClick={onClose} aria-label="Close"><X size={18} /></button></div>
    <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
      <label className={`${FIELD} sm:col-span-2`}>Opportunity name<input autoFocus className={INPUT} value={form.title} onChange={set('title')} placeholder="e.g. Jim Ovia Foundation Scholarship" required /></label>
      <label className={FIELD}>Organisation<input className={INPUT} value={form.organization} onChange={set('organization')} placeholder="Who’s offering it?" /></label>
      <label className={FIELD}>Type<select className={`${INPUT} cursor-pointer appearance-none`} value={form.type} onChange={set('type')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label className={FIELD}>Deadline<input type="date" className={INPUT} value={form.deadline} onChange={set('deadline')} /></label>
      <label className={FIELD}>Location<input className={INPUT} value={form.location} onChange={set('location')} placeholder="Remote, Nigeria…" /></label>
      <label className={`${FIELD} sm:col-span-2`}>Link<input type="url" className={INPUT} value={form.link} onChange={set('link')} placeholder="https://…" /></label>
      <label className={`${FIELD} sm:col-span-2`}>Notes<textarea className={`${INPUT} resize-y leading-relaxed`} value={form.notes} onChange={set('notes')} rows="3" placeholder="Requirements, who shared it, anything worth remembering…" /></label>
    </div>
    <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4"><button type="button" className={BTN_GHOST} onClick={onClose}>Cancel</button><button className={BTN_SOLID} disabled={saving}>{saving ? 'Saving…' : <><Plus size={16} /> Add to board</>}</button></div>
  </form></div>;
}

function ResponseForm({ pending, onClose, onConfirm }) {
  const [outcome, setOutcome] = useState('Offer');
  const [note, setNote] = useState('');
  const rejected = outcome === 'Rejected';
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/30 p-5 backdrop-blur animate-[fade-in_0.16s_ease]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="relative max-h-[calc(100vh-2.5rem)] w-full max-w-[460px] overflow-auto rounded-[18px] border border-line bg-paper p-5 shadow-[0_30px_90px_rgba(10,10,10,0.18)] animate-[modal-in_0.2s_ease-out] sm:p-6" onSubmit={(e) => { e.preventDefault(); onConfirm(outcome, note); }}>
    <div className="mb-4 grid size-[38px] place-items-center rounded-full border border-line text-ink"><Lock size={18} /></div><button type="button" className={`${ICON_BTN} absolute right-3.5 top-3.5`} onClick={onClose} aria-label="Close"><X size={17} /></button>
    <p className={EYEBROW}>Close the loop</p><h2 className="mt-1.5 text-[1.65rem] font-medium tracking-[-0.04em]">Log their response</h2><p className="mb-3.5 text-[0.82rem] text-muted">{pending.title}</p>
    <div className="my-3.5 flex gap-2 rounded-[9px] border border-line bg-surface p-3 text-[11px] leading-relaxed text-muted"><Lock size={15} className="mt-0.5 shrink-0" /><span>Confirming locks <b className="font-medium text-ink">your progress</b> on this opportunity. You can still read it and comment.</span></div>
    <label className={FIELD}>What did they say?<select className={`${INPUT} cursor-pointer appearance-none`} value={outcome} onChange={(e) => setOutcome(e.target.value)}>{OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select></label>
    <label className={`${FIELD} mt-3.5`}>{rejected ? 'Reason for rejection (required)' : 'Note (optional)'}<textarea className={`${INPUT} resize-y leading-relaxed`} autoFocus={rejected} value={note} onChange={(e) => setNote(e.target.value)} rows="3" required={rejected} placeholder={rejected ? 'Add the reason so you both know for next time…' : 'Any useful details, dates or next steps…'} /></label>
    <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4"><button type="button" className={BTN_GHOST} onClick={onClose}>Keep it open</button><button className={BTN_SOLID} disabled={rejected && !note.trim()}><Lock size={15} /> Confirm &amp; lock</button></div>
  </form></div>;
}

function OpportunityDrawer({ item, trackers, member, teammate, comments, activity, onClose, onSave, onDelete, onComment, commentText, setCommentText }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(item);
  useEffect(() => { setForm(item); setEditing(false); }, [item.id]);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = (e) => { e.preventDefault(); onSave(form); setEditing(false); };
  const people = [member, teammate];

  return <div className="fixed inset-0 z-[60] flex justify-end bg-ink/25 backdrop-blur-sm animate-[fade-in_0.18s_ease]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><aside className="flex h-full w-full max-w-[540px] flex-col overflow-auto border-l border-line bg-paper px-4 pb-8 pt-6 shadow-[-24px_0_70px_rgba(10,10,10,0.1)] animate-[drawer-in_0.3s_ease-out] sm:px-6" aria-label="Opportunity details">
    <div className="flex items-center justify-between">
      <span className="font-pixel text-[11px] uppercase tracking-[0.1em] text-muted">{item.type || 'Opportunity'}</span>
      <div className="flex gap-0.5">
        <button className={ICON_BTN} title="Edit opportunity" onClick={() => setEditing((v) => !v)}><Settings2 size={17} /></button>
        <button className={`${ICON_BTN} hover:text-ink`} title="Delete" onClick={onDelete}><Trash2 size={16} /></button>
        <button className={ICON_BTN} onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
    </div>
    {editing ? <form onSubmit={submit} className="mt-6 grid gap-4">
      <h2 className="mb-1 text-[1.35rem] font-medium tracking-[-0.035em]">Edit opportunity</h2>
      <label className={FIELD}>Title<input className={INPUT} value={form.title} onChange={set('title')} required /></label>
      <label className={FIELD}>Organisation<input className={INPUT} value={form.organization} onChange={set('organization')} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className={FIELD}>Type<select className={`${INPUT} cursor-pointer appearance-none`} value={form.type} onChange={set('type')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label><label className={FIELD}>Deadline<input type="date" className={INPUT} value={form.deadline} onChange={set('deadline')} /></label></div>
      <label className={FIELD}>Location<input className={INPUT} value={form.location} onChange={set('location')} /></label>
      <label className={FIELD}>Link<input type="url" className={INPUT} value={form.link} onChange={set('link')} /></label>
      <label className={FIELD}>Notes<textarea className={`${INPUT} resize-y leading-relaxed`} rows="4" value={form.notes} onChange={set('notes')} /></label>
      <div className="flex justify-end gap-2 pt-1"><button type="button" className={BTN_GHOST} onClick={() => setEditing(false)}>Cancel</button><button className={BTN_SOLID}><Check size={15} /> Save</button></div>
    </form> : <>
      <div className="mt-6"><h1 className="m-0 text-[clamp(1.7rem,3vw,2.15rem)] font-medium leading-[1.12] tracking-[-0.045em]">{item.title}</h1>{item.organization && <p className="mt-1.5 text-[11px] text-muted">{item.organization}</p>}</div>
      <div className="mt-4 flex flex-wrap gap-3.5 text-[11px] text-muted">
        {item.deadline && <span className="inline-flex items-center gap-1.5"><Clock3 size={13} /> Due {dateLabel(item.deadline)}</span>}
        {item.location && <span>{item.location}</span>}
      {item.link && <a className="inline-flex items-center gap-1.5 text-ink underline decoration-line underline-offset-4 hover:decoration-current" href={item.link} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Opportunity page</a>}
      </div>
      {item.notes && <div className="mt-5 rounded-[10px] bg-surface p-4"><p className={EYEBROW}>Notes</p><p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-muted">{item.notes}</p></div>}
      <section className="mt-6 border-t border-line pt-6">
        <div className="flex items-start justify-between gap-4 text-faint"><div><p className={EYEBROW}>Two separate journeys</p><h3 className="mt-1.5 text-xl font-medium tracking-[-0.03em] text-ink">Progress</h3></div><Users size={17} /></div>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">{people.map((p) => {
          const tracker = trackers.find((t) => t.member_id === p.id);
          const isYou = p.id === member.id;
          return <div className={`min-w-0 rounded-[10px] p-3.5 ${isYou ? 'bg-neutral-50 ring-1 ring-ink' : 'bg-surface'}`} key={p.id}>
            <div className="flex min-w-0 items-center gap-2">
              <span className={`grid size-[26px] shrink-0 place-items-center rounded-full font-pixel text-[11px] ${isYou ? 'bg-ink text-paper' : 'border border-line bg-transparent text-ink'}`}>{initials(p.name)}</span>
              <div className="grid min-w-0 gap-1"><b className="truncate text-[11px] font-medium">{isYou ? 'You' : p.name}</b><span className={statusPillClass(tracker?.status || 'not_started', true)}>{statusLabel(tracker)}</span></div>
              {tracker?.status === 'response' && <Lock size={12} className="ml-auto text-muted" />}
            </div>
            {tracker?.status === 'response' && <div className="mt-3 pt-2.5"><span className={`inline-block rounded-full px-2.5 py-1 font-pixel text-[11px] uppercase tracking-[0.05em] ${outcomeTagClass(tracker.outcome)}`}>{tracker.outcome || 'Response'}</span>{tracker.response_note && <p className="mt-2 text-[11px] leading-relaxed text-muted">{tracker.response_note}</p>}</div>}
            {tracker?.status === 'not_interested' && tracker.response_note && <div className="mt-3 pt-2.5"><span className="inline-block rounded-full bg-red-700 px-2.5 py-1 font-pixel text-[11px] uppercase tracking-[0.05em] text-white">Passed</span><p className="mt-2 text-[11px] leading-relaxed text-muted">{tracker.response_note}</p></div>}
            {tracker?.date_applied && <div className="mt-2.5 border-t border-line pt-2 font-pixel text-[11px] uppercase tracking-[0.06em] text-faint">Submitted {dateLabel(tracker.date_applied)}</div>}
          </div>;
        })}</div>
        <p className="mt-3.5 text-[11px] leading-relaxed text-faint">Drag your own card on the board to move your progress. Locked responses stay read-only.</p>
      </section>
      <section className="mt-6 border-t border-line pt-6">
        <div className="flex items-start justify-between gap-4 text-faint"><div><p className={EYEBROW}>Keep each other in the loop</p><h3 className="mt-1.5 text-xl font-medium tracking-[-0.03em] text-ink">Comments <span className="ml-1 inline-grid size-[18px] place-items-center rounded-full bg-surface font-pixel text-[11px] align-[2px] text-muted">{comments.length}</span></h3></div><MessageCircle size={17} /></div>
        <div className="mt-4 grid max-h-[280px] gap-3 overflow-auto">{comments.length ? comments.map((c) => { const m = memberById(c.author_id); return <div className="flex items-start gap-2" key={c.id}><span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink font-pixel text-[11px] text-paper">{initials(m.name)}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><b className="text-[11px] font-medium">{m.name}</b><time className="font-pixel text-[11px] tracking-[0.04em] text-faint">{since(c.created_at)}</time></div><p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted">{c.body}</p></div></div>; }) : <div className="py-2 text-[11px] text-faint">No comments yet. Share a thought or offer to review.</div>}</div>
        <form className="mt-3.5 flex items-center gap-1.5 rounded-full border border-line py-1 pl-3 pr-1 focus-within:border-ink" onSubmit={onComment}><input className="min-w-0 flex-1 border-0 bg-transparent text-[11px] text-ink outline-none placeholder:text-faint" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Write a comment…" aria-label="Write a comment" /><button className="grid size-[30px] place-items-center rounded-full bg-ink text-paper disabled:opacity-35" disabled={!commentText.trim()} aria-label="Send comment"><Send size={15} /></button></form>
      </section>
      <section className="mt-6 border-t border-line pt-6"><p className={EYEBROW}>Recent activity</p>{activity.slice(0, 4).length ? activity.slice(0, 4).map((a) => <ActivityLine key={a.id} entry={a} compact />) : <div className="py-2 text-[11px] text-faint">No activity logged yet.</div>}</section>
    </>}
  </aside></div>;
}

function ActivityPage({ activity, items }) {
  return <div className="max-w-[60rem]">
    <div className="pt-10 pb-6 md:pt-[clamp(2.5rem,5vw,4.5rem)]"><p className={EYEBROW}>Coffer — shared history</p><h1 className="mt-2.5 mb-2 text-[clamp(2.4rem,5vw,4.25rem)] font-medium leading-[0.95] tracking-[-0.05em]">Activity<span className="font-serif font-normal italic">.</span></h1><p className="max-w-[52ch] text-[clamp(0.95rem,1.2vw,1.05rem)] tracking-[-0.01em] text-muted">Every add, move, and note from both sides.</p></div>
    <div className="mt-5 border-t border-line">{activity.length ? activity.map((a) => <ActivityLine key={a.id} entry={a} item={items.find((i) => i.id === a.opportunity_id)} large />) : <div className="grid justify-items-center gap-2 py-16 text-center"><Activity size={20} className="text-muted" /><b className="text-[1.05rem] font-medium">Nothing on the record yet</b><span className="text-[0.85rem] text-muted">Adding, moving and commenting will show up here.</span></div>}</div>
  </div>;
}

function ActivityLine({ entry, item, large = false, compact = false }) {
  const who = memberById(entry.actor_id);
  const detail = entry.detail || {};
  let phrase = 'updated an opportunity';
  if (entry.action === 'created') phrase = `added “${detail.title || item?.title || 'an opportunity'}”`;
  else if (entry.action === 'edited') phrase = `updated “${detail.title || item?.title || 'an opportunity'}”`;
  else if (entry.action === 'deleted') phrase = `removed “${detail.title || 'an opportunity'}”`;
  else if (entry.action === 'commented') phrase = `left a comment on “${item?.title || 'an opportunity'}”`;
  else if (entry.action === 'status_changed') phrase = `moved ${detail.member_id === 'elijah' ? 'Elijah’s' : 'Imran’s'} “${item?.title || 'opportunity'}” to ${STATUS_LABELS[detail.to] || detail.to}`;
  else if (entry.action === 'response_logged') phrase = `logged a ${detail.outcome || 'response'} for “${item?.title || 'an opportunity'}”`;
  return <div className={`flex items-start border-b border-line ${large ? 'gap-3.5 py-4' : compact ? 'gap-2 py-2.5' : 'gap-2.5 py-3'}`}>
    <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-ink font-pixel text-[11px] text-paper">{initials(who.name)}</span>
    <div className="min-w-0 flex-1"><p className="mt-0.5 mb-0.5 text-[11px] leading-relaxed text-muted"><b className="font-medium text-ink">{who.name}</b> {phrase}</p>{entry.action === 'response_logged' && detail.note && <div className="my-1.5 rounded-r-md border-l-2 border-neutral-400 bg-surface px-2.5 py-2 text-[11px] leading-relaxed text-muted">“{detail.note}”</div>}<time className="font-pixel text-[11px] tracking-[0.04em] text-faint">{since(entry.created_at)}</time></div>
    {!compact && <span className={`mt-0.5 rounded-full px-2.5 py-1 font-pixel text-[11px] uppercase tracking-[0.06em] text-white ${entry.action === 'response_logged' ? 'bg-green-700' : entry.action === 'status_changed' ? 'bg-blue-700' : entry.action === 'commented' ? 'bg-purple-700' : 'bg-neutral-700'}`}>{entry.action === 'status_changed' ? 'Status' : entry.action === 'response_logged' ? 'Response' : entry.action === 'commented' ? 'Comment' : 'Update'}</span>}
  </div>;
}

function EssaysPlaceholder() {
  return <div className="mx-auto my-[clamp(3rem,9vw,8rem)] max-w-[34rem] text-center">
    <div className="mx-auto mb-5 grid size-11 place-items-center rounded-full border border-line text-muted"><FileText size={20} /></div>
    <p className={EYEBROW}>On the list</p>
    <h1 className="mt-2.5 mb-3 text-[clamp(2rem,4vw,3rem)] font-medium leading-none tracking-[-0.045em]">Essays &amp; drafts<span className="font-serif font-normal italic">.</span></h1>
    <p className="text-[0.9rem] leading-[1.7] text-muted">Essays get their own home once the shared board is humming. For now, keep drafts in your existing documents and link them from an opportunity’s notes.</p>
    <span className="mt-4 inline-block rounded-full border border-line px-2.5 py-1 font-pixel text-[11px] uppercase tracking-[0.08em] text-faint">Coming in a next pass</span>
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
