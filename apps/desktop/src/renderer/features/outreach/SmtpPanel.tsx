import React, { useEffect, useState } from 'react';
import { Button, Card, CardContent, CardHeader, Checkbox, Field, Input, useToast } from '@nomadic/ui';
import { Mail } from 'lucide-react';
import type { OutreachSmtpSettings } from '../../../shared/ipc';

interface SmtpPanelProps {
  smtp: OutreachSmtpSettings | null;
  onChanged: () => void;
}

/** The user's own email account for sending. The password stays in this computer's keychain. */
export function SmtpPanel({ smtp, onChanged }: SmtpPanelProps) {
  const { toast } = useToast();
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [fromName, setFromName] = useState('');
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!smtp) return;
    setHost(smtp.host);
    setPort(String(smtp.port || 587));
    setSecure(smtp.secure);
    setUser(smtp.user);
    setFromName(smtp.fromName);
  }, [smtp]);

  const portNum = Number(port);
  const portOk = Number.isInteger(portNum) && portNum > 0 && portNum < 65536;
  const canSave = host.trim() !== '' && user.trim() !== '' && portOk && (smtp?.configured || password !== '');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const a = window.api;
    if (!a?.outreachSaveSmtp || !canSave) return;
    setBusy('save');
    setError(null);
    try {
      const r = await a.outreachSaveSmtp({ host: host.trim(), port: portNum, secure, user: user.trim(), password: password || undefined, fromName: fromName.trim() });
      if (!r.success) {
        setError(r.error || 'Nomadic could not sign in to that account.');
        return;
      }
      setPassword('');
      toast({ title: 'Email account connected', description: 'Nomadic signed in to it successfully.', tone: 'success' });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nomadic could not sign in to that account.');
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    const a = window.api;
    if (!a?.outreachClearSmtp) return;
    setBusy('clear');
    try {
      await a.outreachClearSmtp();
      setPassword('');
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<Mail />}
        title="Your email account"
        description="Emails go out from your own address, at most 20 a day. For Gmail, turn on 2-step verification and create an app password; your normal password will not work."
      />
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-3" aria-label="Email account">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="SMTP server" hint="Gmail: smtp.gmail.com">
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" />
            </Field>
            <Field label="Port" error={portOk ? undefined : 'Enter a port number.'}>
              <Input value={port} inputMode="numeric" invalid={!portOk} onChange={(e) => setPort(e.target.value)} />
            </Field>
            <Field label="Email address">
              <Input type="email" value={user} onChange={(e) => setUser(e.target.value)} />
            </Field>
            <Field label="App password" hint={smtp?.configured ? 'Leave empty to keep the saved one.' : 'Stored only on this computer.'}>
              <Input type="password" value={password} autoComplete="off" onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Name shown to recipients">
              <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Optional" />
            </Field>
          </div>
          <Checkbox label="Use SSL (port 465)" checked={secure} onCheckedChange={(c) => setSecure(c === true)} />
          {error && <p role="alert" className="text-caption text-danger-fg">{error}</p>}
          <div className="flex justify-end gap-2">
            {smtp?.configured && (
              <Button type="button" variant="ghost" loading={busy === 'clear'} onClick={clear}>Disconnect</Button>
            )}
            <Button type="submit" disabled={!canSave} loading={busy === 'save'} loadingText="Signing in">
              {smtp?.configured ? 'Save and test' : 'Connect and test'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
