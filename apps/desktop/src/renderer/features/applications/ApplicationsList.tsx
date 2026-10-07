import React from 'react';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@nomadic/ui';
import type { Application } from '../../types';
import { CompanyLogo } from '../feed/CompanyLogo';
import { formatDate, lastActivity, modeLabel } from './applicationsLogic';
import { MoveSelect, StatusBadge } from './ApplicationCard';

interface ApplicationsListProps {
  apps: Application[];
  onOpen: (app: Application) => void;
  onMove: (app: Application, status: string) => void;
}

const fmtMs = (ms: number) => (ms ? formatDate(new Date(ms).toISOString()) : 'Unknown date');

export function ApplicationsList({ apps, onOpen, onMove }: ApplicationsListProps) {
  return (
    <Table aria-label="Applications" stickyHeader>
      <TableHeader>
        <TableRow>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Applied</TableHead>
          <TableHead>Last update</TableHead>
          <TableHead>How</TableHead>
          <TableHead><span className="sr-only">Move</span></TableHead>
          <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {apps.map((app) => (
          <TableRow key={app.id ?? app.apply_url}>
            <TableCell className="max-w-[280px]">
              <div className="flex min-w-0 items-center gap-2.5">
                <CompanyLogo company={app.company} url={app.apply_url} size="sm" />
                <div className="min-w-0">
                  <div className="truncate font-strong text-fg">{app.title}</div>
                  <div className="truncate text-caption text-fg-muted">{app.company}</div>
                </div>
              </div>
            </TableCell>
            <TableCell><StatusBadge status={app.status} /></TableCell>
            <TableCell muted className="whitespace-nowrap">{formatDate(app.applied_at)}</TableCell>
            <TableCell muted className="whitespace-nowrap">{fmtMs(lastActivity(app))}</TableCell>
            <TableCell muted className="whitespace-nowrap">{modeLabel(app.mode)}</TableCell>
            <TableCell className="w-44"><MoveSelect app={app} onMove={(s) => onMove(app, s)} className="w-40" /></TableCell>
            <TableCell align="right">
              <Button size="sm" variant="ghost" onClick={() => onOpen(app)} aria-label={`Details for ${app.title} at ${app.company}`}>Details</Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
