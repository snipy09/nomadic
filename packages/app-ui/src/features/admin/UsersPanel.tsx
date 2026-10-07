import React, { useMemo, useState } from 'react';
import { RefreshCw, Search, Users, X } from 'lucide-react';
import {
  Badge, Button, EmptyState, IconButton, Input, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@nomadic/ui';
import { getApi } from '../../types';
import type { AdminUserQuery, AdminUserStatus } from '@nomadic/app-core/shared/admin';
import { PLAN_OPTIONS, expiryLabel, formatRelative, tierLabel } from './adminLogic';
import { AdminErrorState, LoadingRows } from './shared';
import { useAdminQuery } from './useAdminQuery';
import { UserDrawer } from './UserDrawer';

const PAGE = 50;

export function UsersPanel({ selfId }: { selfId: string | null }) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | AdminUserStatus>('all');
  const [tier, setTier] = useState('all');
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const query: AdminUserQuery = useMemo(() => ({
    query: search || undefined,
    status: status === 'all' ? undefined : status,
    tier: tier === 'all' ? undefined : tier,
    limit: PAGE,
    offset,
  }), [search, status, tier, offset]);
  const users = useAdminQuery(() => getApi().adminListUsers(query), JSON.stringify(query));

  const rows = users.data?.users ?? [];
  const total = users.data?.total ?? 0;
  const opened = openId ? rows.find((u) => u.id === openId) ?? null : null;
  const filtered = Boolean(search) || status !== 'all' || tier !== 'all';

  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); setOffset(0); setSearch(draft.trim()); };
  const clearFilters = () => { setDraft(''); setSearch(''); setStatus('all'); setTier('all'); setOffset(0); };

  let body: React.ReactNode;
  if (users.error) body = <AdminErrorState title="Could not load users" error={users.error} code={users.code} onRetry={users.refresh} />;
  else if (users.loading && !users.data) body = <LoadingRows label="Loading users" />;
  else if (rows.length === 0) {
    body = filtered ? (
      <EmptyState bordered icon={<Search />} title="No users match" description="Try another email, name or user ID, or clear the filters."
        actions={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>} />
    ) : (
      <EmptyState bordered icon={<Users />} title="No users yet" description="Accounts appear here after people sign up in the app." />
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <Table aria-label="Users" stickyHeader>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead align="right">Devices</TableHead>
              <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => {
              const exp = expiryLabel(u.expiresAt);
              return (
                <TableRow key={u.id}>
                  <TableCell className="max-w-[300px]">
                    <div className="flex items-center gap-2 truncate font-strong text-fg">
                      <span className="truncate">{u.fullName || u.email}</span>
                      {u.role === 'admin' && <Badge tone="warning" size="sm">Admin</Badge>}
                    </div>
                    <div className="truncate text-caption text-fg-muted">{u.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-fg">{tierLabel(u.tier)}</div>
                    <div className={exp.tone === 'danger' ? 'text-caption text-danger-fg' : exp.tone === 'warning' ? 'text-caption text-warning-fg' : 'text-caption text-fg-subtle'}>{exp.text}</div>
                  </TableCell>
                  <TableCell>
                    <Badge tone={u.status === 'suspended' ? 'danger' : 'success'} size="sm" dot>{u.status === 'suspended' ? 'Suspended' : 'Active'}</Badge>
                  </TableCell>
                  <TableCell muted className="whitespace-nowrap">{formatRelative(u.lastLogin)}</TableCell>
                  <TableCell align="right" muted>{u.activeSessions}</TableCell>
                  <TableCell align="right">
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(u.id)} aria-label={`Manage ${u.email}`}>Manage</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex items-center gap-3">
          <p className="mr-auto text-caption text-fg-subtle" aria-live="polite">
            {offset + 1} to {offset + rows.length} of {total}
          </p>
          <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
          <Button size="sm" variant="secondary" disabled={offset + rows.length >= total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <form role="search" onSubmit={submitSearch} className="flex min-w-[260px] flex-1 items-center gap-2">
          <Input
            wrapperClassName="flex-1"
            leftIcon={<Search />}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search by email, name or user ID"
            aria-label="Search users"
            maxLength={200}
            rightSlot={draft ? <IconButton label="Clear search" icon={<X />} size="sm" variant="ghost" tooltip={false} onClick={() => { setDraft(''); setSearch(''); setOffset(0); }} /> : undefined}
          />
          <Button type="submit" variant="secondary">Search</Button>
        </form>
        <Select aria-label="Plan" value={tier} onValueChange={(v) => { setTier(v); setOffset(0); }}
          options={[{ value: 'all', label: 'All plans' }, ...PLAN_OPTIONS.map((p) => ({ value: p.value, label: tierLabel(p.value) }))]} />
        <Select aria-label="Status" value={status} onValueChange={(v) => { setStatus(v as 'all' | AdminUserStatus); setOffset(0); }}
          options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} />
        <Button variant="secondary" size="sm" leftIcon={<RefreshCw />} loading={users.loading && !!users.data} onClick={users.refresh}>Refresh</Button>
      </div>
      {body}
      <UserDrawer user={opened} selfId={selfId} onClose={() => setOpenId(null)} onChanged={users.refresh} />
    </div>
  );
}
