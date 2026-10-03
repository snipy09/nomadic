import React, { useState } from 'react';
import { Activity, BookOpen, History, ShieldAlert, Users } from 'lucide-react';
import { EmptyState, Tabs, TabsContent, TabsList, TabsTrigger } from '@nomadic/ui';
import type { AppUser } from '../../types';
import { UsersPanel } from './UsersPanel';
import { AuditPanel } from './AuditPanel';
import { ScraperPanel } from './ScraperPanel';
import { ContentPanel } from './ContentPanel';

type AdminTab = 'users' | 'audit' | 'scrapers' | 'content';

interface AdminViewProps {
  currentUser: AppUser | null;
}

/**
 * Admin and content tools. Showing this screen only to role === 'admin' is a
 * convenience: every read and write is re-authorized by the server (session +
 * users_profile.role, migration 014) and every change is audited there.
 */
export function AdminView({ currentUser }: AdminViewProps) {
  const [tab, setTab] = useState<AdminTab>('users');

  if (currentUser?.role !== 'admin') {
    return (
      <EmptyState
        bordered
        icon={<ShieldAlert />}
        title="Admin access required"
        description="This area is only for Nomadic operators."
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 pb-24">
      <header>
        <h1 className="text-title font-strong text-fg">Admin</h1>
        <p className="text-caption text-fg-subtle">Support lookups, plan and access changes, scraper health and learning content. Every change is audited.</p>
      </header>
      <Tabs value={tab} onValueChange={(v) => setTab(v as AdminTab)}>
        <TabsList aria-label="Admin sections">
          <TabsTrigger value="users" icon={<Users />}>Users</TabsTrigger>
          <TabsTrigger value="audit" icon={<History />}>Audit log</TabsTrigger>
          <TabsTrigger value="scrapers" icon={<Activity />}>Scraper health</TabsTrigger>
          <TabsTrigger value="content" icon={<BookOpen />}>Content</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="pt-4"><UsersPanel selfId={currentUser.id != null ? String(currentUser.id) : null} /></TabsContent>
        <TabsContent value="audit" className="pt-4"><AuditPanel /></TabsContent>
        <TabsContent value="scrapers" className="pt-4"><ScraperPanel /></TabsContent>
        <TabsContent value="content" className="pt-4"><ContentPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
