#!/usr/bin/env node
// Coffer MCP server (stdio).
//
// Runs as the person whose credentials are in .env.mcp.local, so every read and
// write goes through Supabase RLS exactly like the web app. No service-role key.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ID = 'e72ec8e1-640b-4e58-b474-902691a1c3df';

const STATUSES = ['not_started', 'in_progress', 'submitted', 'response', 'not_interested'];
const OUTCOMES = ['Offer', 'Rejected', 'Interview', 'Waitlisted', 'Other'];
const TYPES = ['Scholarship', 'Internship', 'Fellowship', 'Grant', 'Competition', 'Conference', 'Volunteer', 'Other'];
const PRIORITIES = ['High', 'Medium', 'Low'];

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, '.env.local'));
loadEnvFile(path.join(ROOT, '.env.mcp.local'));

const SUPABASE_URL = process.env.COFFER_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.COFFER_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.COFFER_EMAIL;
const PASSWORD = process.env.COFFER_PASSWORD;

let authPromise = null;

function auth() {
  if (!authPromise) {
    authPromise = connect().catch((error) => {
      authPromise = null;
      throw error;
    });
  }
  return authPromise;
}

async function connect() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      'Coffer is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local, then run `npm run mcp:login`.',
    );
  }
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      'Coffer MCP has no signed-in person. Run `npm run mcp:login` in the project to write .env.mcp.local.',
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const { error: signInError } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (signInError) {
    throw new Error(`Coffer sign-in failed for ${EMAIL}: ${signInError.message}`);
  }

  const { error: joinError } = await supabase.rpc('join_bomb_site');
  if (joinError) {
    throw new Error(`Could not open the Coffer workspace: ${joinError.message}`);
  }

  const { data: member, error: memberError } = await supabase
    .from('workspace_members')
    .select('member_id, display_name, email')
    .single();

  if (memberError || !member) {
    throw new Error(`Could not read your Coffer member record: ${memberError?.message || 'no row'}`);
  }

  return { supabase, member };
}

function text(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function failure(error) {
  return {
    isError: true,
    content: [{ type: 'text', text: `Coffer error: ${error?.message || String(error)}` }],
  };
}

function tool(handler) {
  return async (args) => {
    try {
      return text(await handler(args));
    } catch (error) {
      return failure(error);
    }
  };
}

function progress(tracker) {
  if (!tracker) return { status: 'not_started', locked: false };
  return {
    status: tracker.status,
    outcome: tracker.outcome,
    note: tracker.response_note,
    priority: tracker.priority,
    date_applied: tracker.date_applied,
    locked: tracker.locked,
    updated_at: tracker.updated_at,
  };
}

async function loadBoard(supabase) {
  const [opportunities, trackers, comments] = await Promise.all([
    supabase.from('opportunities').select('*').order('created_at', { ascending: false }),
    supabase.from('trackers').select('*'),
    supabase.from('comments').select('opportunity_id'),
  ]);
  const error = opportunities.error || trackers.error || comments.error;
  if (error) throw new Error(error.message);

  const commentCount = new Map();
  for (const row of comments.data || []) {
    commentCount.set(row.opportunity_id, (commentCount.get(row.opportunity_id) || 0) + 1);
  }

  return (opportunities.data || []).map((item) => {
    const rows = (trackers.data || []).filter((t) => t.opportunity_id === item.id);
    return { item, rows, comments: commentCount.get(item.id) || 0 };
  });
}

function cardFor(entry, memberId, teammateId) {
  const { item, rows, comments } = entry;
  const own = rows.find((t) => t.member_id === memberId);
  const theirs = rows.find((t) => t.member_id === teammateId);
  return {
    id: item.id,
    title: item.title,
    organization: item.organization,
    type: item.type,
    deadline: item.deadline,
    link: item.link,
    location: item.location,
    notes: item.notes,
    created_by: item.created_by,
    created_at: item.created_at,
    comments,
    my_progress: progress(own),
    teammate_progress: progress(theirs),
  };
}

function teammateOf(memberId) {
  return memberId === 'imran' ? 'elijah' : 'imran';
}

async function logActivity(supabase, memberId, action, opportunityId, detail) {
  const { error } = await supabase.from('activity').insert({
    opportunity_id: opportunityId || null,
    actor_id: memberId,
    action,
    detail,
  });
  if (error) throw new Error(`Could not log activity: ${error.message}`);
}

async function findEntry(supabase, id) {
  const { data: item, error } = await supabase.from('opportunities').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!item) throw new Error(`No opportunity with id ${id}. Use list_opportunities to find the right id.`);

  const { data: rows, error: trackerError } = await supabase
    .from('trackers')
    .select('*')
    .eq('opportunity_id', id);
  if (trackerError) throw new Error(trackerError.message);

  return { item, rows };
}

const server = new McpServer(
  { name: 'coffer', version: '1.0.0' },
  {
    instructions:
      'Coffer is a private two-person opportunity board for Imran and Elijah. You act as the signed-in person only. ' +
      'Read the board before writing, use ids from list_opportunities, and update only your own progress. ' +
      'A response is terminal: once an opportunity is moved to "response" with an outcome, it locks and cannot change. ' +
      'Never invent opportunities, statuses, or responses. Prefer small, explicit updates and confirm the result.',
  },
);

server.registerTool(
  'whoami',
  {
    title: 'Who am I in Coffer',
    description: 'Show which Coffer member this MCP connection is signed in as.',
    inputSchema: {},
  },
  tool(async () => {
    const { member } = await auth();
    return { member_id: member.member_id, name: member.display_name, email: member.email };
  }),
);

server.registerTool(
  'list_opportunities',
  {
    title: 'List opportunities',
    description:
      'List opportunities on the shared Coffer board with your progress and your teammate\'s progress. Optionally filter by a text query, your status, or type.',
    inputSchema: {
      query: z.string().optional().describe('Case-insensitive text match on title, organization, notes, or location.'),
      status: z.enum(STATUSES).optional().describe('Only opportunities where your own progress has this status.'),
      type: z.enum(TYPES).optional().describe('Only this opportunity type.'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum rows to return (default 50).'),
    },
  },
  tool(async ({ query, status, type, limit }) => {
    const { supabase, member } = await auth();
    const board = await loadBoard(supabase);
    const teammateId = teammateOf(member.member_id);
    const needle = query?.trim().toLowerCase();

    const rows = board
      .map((entry) => cardFor(entry, member.member_id, teammateId))
      .filter((card) => {
        if (type && card.type !== type) return false;
        if (status && card.my_progress.status !== status) return false;
        if (!needle) return true;
        return [card.title, card.organization, card.notes, card.location]
          .some((value) => (value || '').toLowerCase().includes(needle));
      })
      .slice(0, limit ?? 50);

    return { member_id: member.member_id, count: rows.length, opportunities: rows };
  }),
);

server.registerTool(
  'get_opportunity',
  {
    title: 'Get one opportunity',
    description:
      'Read one opportunity in full: details, both progress trackers, comments, and recent activity. Use this before updating or commenting.',
    inputSchema: {
      id: z.string().uuid().describe('Opportunity id from list_opportunities.'),
    },
  },
  tool(async ({ id }) => {
    const { supabase, member } = await auth();
    const { item, rows } = await findEntry(supabase, id);
    const teammateId = teammateOf(member.member_id);

    const [comments, activity] = await Promise.all([
      supabase.from('comments').select('*').eq('opportunity_id', id).order('created_at', { ascending: true }),
      supabase
        .from('activity')
        .select('*')
        .eq('opportunity_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    const error = comments.error || activity.error;
    if (error) throw new Error(error.message);

    return {
      ...cardFor({ item, rows, comments: (comments.data || []).length }, member.member_id, teammateId),
      comments: comments.data || [],
      activity: activity.data || [],
    };
  }),
);

server.registerTool(
  'add_opportunity',
  {
    title: 'Add an opportunity',
    description:
      'Add a new opportunity to the shared Coffer board. Both people get a fresh "not started" tracker automatically. Use this instead of inventing an id.',
    inputSchema: {
      title: z.string().min(1).max(240).describe('Opportunity name.'),
      organization: z.string().max(240).optional().describe('Who is offering it.'),
      type: z.enum(TYPES).optional().describe('Defaults to Other.'),
      deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Deadline as YYYY-MM-DD.'),
      link: z.string().url().optional().describe('Official application or information URL.'),
      location: z.string().max(240).optional().describe('Location or "Remote".'),
      notes: z.string().max(8000).optional().describe('Requirements, eligibility, or anything worth remembering.'),
    },
  },
  tool(async ({ title, organization, type, deadline, link, location, notes }) => {
    const { supabase, member } = await auth();
    const { data: created, error } = await supabase
      .from('opportunities')
      .insert({
        workspace_id: WORKSPACE_ID,
        title: title.trim(),
        organization: organization?.trim() || null,
        type: type || 'Other',
        deadline: deadline || null,
        link: link || null,
        location: location?.trim() || null,
        notes: notes?.trim() || null,
        created_by: member.member_id,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logActivity(supabase, member.member_id, 'created', created.id, { title: created.title });
    return { created: cardFor({ item: created, rows: [], comments: 0 }, member.member_id, teammateOf(member.member_id)) };
  }),
);

server.registerTool(
  'update_opportunity',
  {
    title: 'Update opportunity details',
    description:
      'Edit the shared details of an opportunity (title, organization, type, deadline, link, location, notes). This does not change anyone\'s progress.',
    inputSchema: {
      id: z.string().uuid().describe('Opportunity id.'),
      title: z.string().min(1).max(240).optional(),
      organization: z.string().max(240).nullable().optional().describe('Pass null to clear.'),
      type: z.enum(TYPES).optional(),
      deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe('YYYY-MM-DD, or null to clear.'),
      link: z.string().url().nullable().optional().describe('Pass null to clear.'),
      location: z.string().max(240).nullable().optional().describe('Pass null to clear.'),
      notes: z.string().max(8000).nullable().optional().describe('Pass null to clear.'),
    },
  },
  tool(async ({ id, ...values }) => {
    const { supabase, member } = await auth();
    const patch = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue;
      const next = value === null ? null : String(value).trim() || null;
      if (key === 'title' && !next) throw new Error('title cannot be empty.');
      patch[key] = next;
    }
    if (Object.keys(patch).length === 0) throw new Error('Nothing to update. Pass at least one field.');

    const { data: updated, error } = await supabase
      .from('opportunities')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logActivity(supabase, member.member_id, 'edited', id, { title: updated.title });
    return { updated };
  }),
);

server.registerTool(
  'update_my_progress',
  {
    title: 'Update my progress',
    description:
      'Move your own progress on an opportunity. Use status "response" only when an outcome is known; that locks your tracker permanently. Rejections need a reason in note.',
    inputSchema: {
      id: z.string().uuid().describe('Opportunity id.'),
      status: z.enum(STATUSES).optional().describe('New status for your own tracker.'),
      outcome: z.enum(OUTCOMES).optional().describe('Required when status is "response".'),
      note: z.string().max(4000).optional().describe('Response note. Required when outcome is "Rejected".'),
      priority: z.enum(PRIORITIES).optional(),
      date_applied: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe('YYYY-MM-DD, or null to clear.'),
    },
  },
  tool(async ({ id, status, outcome, note, priority, date_applied }) => {
    const { supabase, member } = await auth();

    const { data: tracker, error } = await supabase
      .from('trackers')
      .select('*')
      .eq('opportunity_id', id)
      .eq('member_id', member.member_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tracker) throw new Error('No tracker for you on that opportunity. Check the id with list_opportunities.');

    if (tracker.locked || tracker.status === 'response') {
      throw new Error('Your response on this opportunity is locked and cannot be changed.');
    }

    if (outcome && status !== 'response') {
      throw new Error('Set status to "response" when recording an outcome.');
    }

    const patch = {};
    if (status) patch.status = status;
    if (priority) patch.priority = priority;
    if (date_applied !== undefined) patch.date_applied = date_applied || null;

    if (status === 'response') {
      if (!outcome) throw new Error('outcome is required when status is "response".');
      if (outcome === 'Rejected' && !(note || '').trim()) {
        throw new Error('A rejection reason is required in note when outcome is "Rejected".');
      }
      patch.outcome = outcome;
      patch.response_note = (note || '').trim() || null;
      patch.locked = true;
    }

    if (Object.keys(patch).length === 0) throw new Error('Nothing to update. Pass status, priority, or date_applied.');

    const { data: updated, error: updateError } = await supabase
      .from('trackers')
      .update(patch)
      .eq('id', tracker.id)
      .select()
      .single();
    if (updateError) throw new Error(updateError.message);

    if (status === 'response') {
      await logActivity(supabase, member.member_id, 'response_logged', id, {
        outcome,
        note: patch.response_note,
        member_id: member.member_id,
      });
    } else if (status && status !== tracker.status) {
      await logActivity(supabase, member.member_id, 'status_changed', id, {
        from: tracker.status,
        to: status,
        member_id: member.member_id,
      });
    }

    return { member_id: member.member_id, progress: progress(updated) };
  }),
);

server.registerTool(
  'add_comment',
  {
    title: 'Comment on an opportunity',
    description: 'Leave a shared comment on an opportunity so the other person sees it.',
    inputSchema: {
      id: z.string().uuid().describe('Opportunity id.'),
      body: z.string().min(1).max(4000).describe('Comment text.'),
    },
  },
  tool(async ({ id, body }) => {
    const { supabase, member } = await auth();
    const { data: comment, error } = await supabase
      .from('comments')
      .insert({ opportunity_id: id, author_id: member.member_id, body: body.trim() })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logActivity(supabase, member.member_id, 'commented', id, {});
    return { comment };
  }),
);

server.registerTool(
  'list_activity',
  {
    title: 'List recent activity',
    description: 'Read the shared Coffer history: adds, edits, status moves, responses, and comments.',
    inputSchema: {
      id: z.string().uuid().optional().describe('Only this opportunity.'),
      limit: z.number().int().min(1).max(100).optional().describe('Default 30.'),
    },
  },
  tool(async ({ id, limit }) => {
    const { supabase } = await auth();
    let query = supabase.from('activity').select('*').order('created_at', { ascending: false }).limit(limit ?? 30);
    if (id) query = query.eq('opportunity_id', id);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const ids = [...new Set((data || []).map((row) => row.opportunity_id).filter(Boolean))];
    const titles = new Map();
    if (ids.length) {
      const { data: items } = await supabase.from('opportunities').select('id, title').in('id', ids);
      for (const item of items || []) titles.set(item.id, item.title);
    }

    return {
      count: (data || []).length,
      activity: (data || []).map((row) => ({ ...row, opportunity_title: titles.get(row.opportunity_id) || null })),
    };
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on('unhandledRejection', (error) => {
  console.error('[coffer-mcp] unhandled rejection:', error);
});
