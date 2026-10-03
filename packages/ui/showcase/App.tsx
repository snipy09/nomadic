import * as React from 'react';
import {
  Bell,
  Bookmark,
  Briefcase,
  Building2,
  Compass,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Inbox,
  LayoutGrid,
  MapPin,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Target,
  Trash2,
  TrendingUp,
  WifiOff,
} from 'lucide-react';
import {
  AppShell,
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  Checkbox,
  Combobox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Drawer,
  DrawerContent,
  DrawerTrigger,
  EmptyState,
  Field,
  HStack,
  IconButton,
  Input,
  Kbd,
  NavItem,
  NavSection,
  NomadicLogo,
  NomadicMark,
  ProgressRing,
  RadioGroup,
  Select,
  Skeleton,
  SkeletonText,
  Spinner,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  colors,
  fontSize,
  useTheme,
  useToast,
  type SortDirection,
  type ThemePreference,
} from '../src';

const params = new URLSearchParams(window.location.search);
const forcedTheme = params.get('theme') as ThemePreference | null;

const sections = [
  { id: 'foundations', label: 'Foundations', icon: <Compass /> },
  { id: 'buttons', label: 'Buttons', icon: <Target /> },
  { id: 'forms', label: 'Forms', icon: <FileText /> },
  { id: 'navigation', label: 'Navigation', icon: <LayoutGrid /> },
  { id: 'data', label: 'Data display', icon: <Briefcase /> },
  { id: 'feedback', label: 'Feedback', icon: <TrendingUp /> },
  { id: 'overlays', label: 'Overlays', icon: <Inbox /> },
];

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 border-b border-line py-10 last:border-b-0">
      <div className="mb-6 flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-title font-strong text-fg">
          {title}
        </h2>
        <p className="max-w-[640px] text-body text-fg-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Demo({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-caption font-strong text-fg-subtle">{label}</div>
      <div className={className ?? 'flex flex-wrap items-center gap-2'}>{children}</div>
    </div>
  );
}

function ThemeToggle({ theme, setTheme }: { theme: ThemePreference; setTheme: (t: ThemePreference) => void }) {
  return (
    <Tabs variant="segmented" value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
      <TabsList aria-label="Theme">
        <TabsTrigger value="light" icon={<Sun />} aria-label="Light theme" className="px-2" />
        <TabsTrigger value="dark" icon={<Moon />} aria-label="Dark theme" className="px-2" />
        <TabsTrigger value="system" icon={<Monitor />} aria-label="System theme" className="px-2" />
      </TabsList>
    </Tabs>
  );
}

/* ---------------------------------------------------------------- */

const sizeClass: Record<keyof typeof fontSize, string> = {
  caption: 'text-caption',
  label: 'text-label',
  body: 'text-body',
  'body-lg': 'text-body-lg',
  heading: 'text-heading font-strong',
  title: 'text-title font-strong',
  headline: 'text-headline font-strong',
  display: 'text-display font-strong',
};

function Foundations({ resolved }: { resolved: 'light' | 'dark' }) {
  const swatches = [
    'canvas',
    'surface',
    'surface-sunken',
    'surface-active',
    'line',
    'line-strong',
    'fg',
    'fg-muted',
    'fg-subtle',
    'accent',
    'accent-subtle',
    'success',
    'warning',
    'danger',
  ] as const;
  return (
    <Stack gap={8}>
      <Demo label="Colour (semantic tokens, values for the current theme)" className="grid grid-cols-7 gap-2">
        {swatches.map((s) => (
          <div key={s} className="flex flex-col gap-1.5">
            <div className="h-12 rounded-md border border-line" style={{ background: `rgb(var(--nm-${s}))` }} />
            <div className="flex flex-col">
              <span className="text-label font-strong text-fg">{s}</span>
              <span className="font-mono text-caption text-fg-subtle">
                {colors[resolved][s]}
              </span>
            </div>
          </div>
        ))}
      </Demo>
      <div className="grid grid-cols-[1.4fr_1fr] gap-8">
        <Demo label="Type scale — two weights: 400 regular, 600 strong" className="flex flex-col gap-2">
          {(Object.keys(fontSize) as Array<keyof typeof fontSize>)
            .slice()
            .reverse()
            .map((k) => (
              <div key={k} className="flex items-baseline gap-4 border-b border-line pb-2 last:border-0">
                <span className="w-16 shrink-0 font-mono text-caption text-fg-subtle">{k}</span>
                <span className={`${sizeClass[k]} truncate text-fg`}>
                  Find the jobs you match
                </span>
                <span className="ml-auto shrink-0 font-mono text-caption text-fg-subtle">{fontSize[k][0]}</span>
              </div>
            ))}
        </Demo>
        <Stack gap={6}>
          <Demo label="Radii — 4 · 6 · 8 · 12" className="flex items-end gap-3">
            {[
              ['rounded', '4'],
              ['rounded-md', '6'],
              ['rounded-lg', '8'],
              ['rounded-xl', '12'],
            ].map(([c, v]) => (
              <div key={c} className="flex flex-col items-center gap-1.5">
                <div className={`size-12 border border-line-strong bg-surface-sunken ${c}`} />
                <span className="font-mono text-caption text-fg-subtle">{v}px</span>
              </div>
            ))}
          </Demo>
          <Demo label="Elevation — e1 controls · e2 popovers · e3 dialogs" className="flex gap-4">
            {['shadow-e1', 'shadow-e2', 'shadow-e3'].map((s) => (
              <div key={s} className={`flex h-14 w-20 items-center justify-center rounded-lg border border-line bg-surface-raised font-mono text-caption text-fg-subtle ${s}`}>
                {s.replace('shadow-', '')}
              </div>
            ))}
          </Demo>
          <Demo label="Spacing — 4 / 8 pt grid" className="flex items-end gap-2">
            {[1, 2, 3, 4, 6, 8, 12].map((n) => (
              <div key={n} className="flex flex-col items-center gap-1.5">
                <div className="bg-accent/80" style={{ width: n * 4, height: n * 4 }} />
                <span className="font-mono text-caption text-fg-subtle">{n * 4}</span>
              </div>
            ))}
          </Demo>
        </Stack>
      </div>
    </Stack>
  );
}

function Buttons() {
  const [saving, setSaving] = React.useState(false);
  return (
    <div className="grid grid-cols-2 gap-8">
      <Demo label="Variants">
        <Button variant="primary">Apply now</Button>
        <Button variant="secondary">Save for later</Button>
        <Button variant="subtle">Tailor resume</Button>
        <Button variant="ghost">Skip</Button>
        <Button variant="danger">Withdraw</Button>
      </Demo>
      <Demo label="Sizes and icons">
        <Button size="sm" leftIcon={<Plus />}>
          Small
        </Button>
        <Button size="md" leftIcon={<Download />}>
          Medium
        </Button>
        <Button size="lg" variant="primary" rightIcon={<ExternalLink />}>
          Large
        </Button>
      </Demo>
      <Demo label="States">
        <Button
          variant="primary"
          loading={saving}
          loadingText="Saving…"
          onClick={() => {
            setSaving(true);
            setTimeout(() => setSaving(false), 1600);
          }}
        >
          Save profile
        </Button>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
      </Demo>
      <Demo label="Icon buttons (tooltip on hover and focus)">
        <IconButton label="Search" icon={<Search />} shortcut={['Ctrl', 'K']} />
        <IconButton label="Filter" icon={<Filter />} variant="secondary" />
        <IconButton label="Bookmark" icon={<Bookmark />} pressed />
        <IconButton label="Refresh" icon={<RefreshCw />} loading />
        <IconButton label="Add job" icon={<Plus />} variant="primary" />
        <IconButton label="Delete" icon={<Trash2 />} size="sm" />
      </Demo>
    </div>
  );
}

const roles = [
  { value: 'fe', label: 'Frontend engineer', hint: '1,240' },
  { value: 'be', label: 'Backend engineer', hint: '980' },
  { value: 'fs', label: 'Full stack engineer', hint: '1,610' },
  { value: 'da', label: 'Data analyst', hint: '720' },
  { value: 'ml', label: 'ML engineer', hint: '430' },
  { value: 'pm', label: 'Product manager', hint: '510' },
  { value: 'pd', label: 'Product designer', hint: '290' },
  { value: 'do', label: 'DevOps engineer', hint: '380' },
];

function Forms() {
  const [role, setRole] = React.useState<string | null>('fs');
  const [notify, setNotify] = React.useState(true);
  return (
    <div className="grid grid-cols-2 gap-x-10 gap-y-6">
      <Stack gap={4}>
        <Field label="Full name" required>
          <Input placeholder="Ada Lovelace" defaultValue="Sajal Mishra" />
        </Field>
        <Field label="Email" error="Enter a valid email address">
          <Input type="email" defaultValue="sajal@" />
        </Field>
        <Field label="Search jobs" hint="Matches titles, companies and skills.">
          <Input leftIcon={<Search />} placeholder="e.g. React, Bengaluru" rightSlot={<Kbd keys={['Ctrl', 'K']} size="sm" />} />
        </Field>
        <Field label="Cover note" labelAside="0 / 500">
          <Textarea placeholder="Two or three lines on why this role." rows={3} />
        </Field>
      </Stack>
      <Stack gap={4}>
        <Field label="Experience level">
          <Select
            defaultValue="mid"
            options={[
              { value: 'intern', label: 'Internship' },
              { value: 'junior', label: 'Entry level (0–2 yrs)' },
              { value: 'mid', label: 'Mid level (2–5 yrs)' },
              { value: 'senior', label: 'Senior (5+ yrs)' },
            ]}
          />
        </Field>
        <Field label="Target role" hint="Type to filter.">
          <Combobox options={roles} value={role} onChange={(v) => setRole(v)} placeholder="Search roles" />
        </Field>
        <Field label="Disabled">
          <Input disabled defaultValue="Locked by your plan" />
        </Field>
        <div className="grid grid-cols-2 gap-6 pt-1">
          <Stack gap={3}>
            <Checkbox label="Remote only" defaultChecked />
            <Checkbox label="Include internships" description="Paid roles only" />
            <Checkbox label="Some sources" checked="indeterminate" />
            <Checkbox label="Disabled" disabled />
          </Stack>
          <RadioGroup
            aria-label="Daily pace"
            defaultValue="steady"
            options={[
              { value: 'light', label: 'Light', description: '30 min a day' },
              { value: 'steady', label: 'Steady', description: '1 hour a day' },
              { value: 'intense', label: 'Intense', description: '2+ hours a day' },
            ]}
          />
        </div>
        <Stack gap={3} className="rounded-lg border border-line bg-surface p-3">
          <Switch label="Email me new matches" description="A digest at 9 am, at most once a day." labelPosition="start" checked={notify} onCheckedChange={setNotify} />
          <Switch label="Auto-apply to strong matches" labelPosition="start" size="sm" />
        </Stack>
      </Stack>
    </div>
  );
}

function Navigation() {
  return (
    <div className="grid grid-cols-2 gap-8">
      <Demo label="Tabs — underline" className="block">
        <Tabs defaultValue="matches">
          <TabsList aria-label="Job views">
            <TabsTrigger value="matches" count={128}>
              Matches
            </TabsTrigger>
            <TabsTrigger value="saved" count={12}>
              Saved
            </TabsTrigger>
            <TabsTrigger value="applied">Applied</TabsTrigger>
            <TabsTrigger value="archived" disabled>
              Archived
            </TabsTrigger>
          </TabsList>
          <TabsContent value="matches" className="text-body text-fg-muted">
            Use ← → to move between tabs, Home / End to jump.
          </TabsContent>
          <TabsContent value="saved" className="text-body text-fg-muted">
            12 saved jobs.
          </TabsContent>
          <TabsContent value="applied" className="text-body text-fg-muted">
            Applications you have sent.
          </TabsContent>
        </Tabs>
      </Demo>
      <Demo label="Tabs — segmented" className="block">
        <Tabs variant="segmented" defaultValue="board">
          <TabsList aria-label="Layout">
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="text-body text-fg-muted">List layout.</TabsContent>
          <TabsContent value="board" className="text-body text-fg-muted">Kanban by stage.</TabsContent>
          <TabsContent value="calendar" className="text-body text-fg-muted">Interviews by date.</TabsContent>
        </Tabs>
        <div className="mt-6 flex flex-wrap items-center gap-4 text-body text-fg-muted">
          <span className="flex items-center gap-2">
            Command palette <Kbd keys={['Ctrl', 'K']} />
          </span>
          <span className="flex items-center gap-2">
            Next job <Kbd>J</Kbd>
          </span>
          <span className="flex items-center gap-2">
            Apply <Kbd keys={['⇧', '↵']} />
          </span>
        </div>
      </Demo>
    </div>
  );
}

type Job = { id: string; role: string; company: string; location: string; match: number; status: 'new' | 'applied' | 'interview' | 'closed'; posted: number };
const jobs: Job[] = [
  { id: '1', role: 'Frontend Engineer', company: 'Razorpay', location: 'Bengaluru', match: 92, status: 'interview', posted: 1 },
  { id: '2', role: 'Software Engineer, Platform', company: 'Postman', location: 'Remote', match: 86, status: 'applied', posted: 2 },
  { id: '3', role: 'Full Stack Developer', company: 'Zerodha', location: 'Mumbai', match: 78, status: 'new', posted: 3 },
  { id: '4', role: 'Product Engineer', company: 'Linear', location: 'Remote', match: 71, status: 'new', posted: 5 },
  { id: '5', role: 'Backend Engineer', company: 'Swiggy', location: 'Hyderabad', match: 54, status: 'closed', posted: 9 },
];
const statusBadge: Record<Job['status'], React.ReactNode> = {
  new: <Badge tone="accent">New</Badge>,
  applied: <Badge tone="neutral" dot>Applied</Badge>,
  interview: <Badge tone="success" dot>Interview</Badge>,
  closed: <Badge tone="danger" variant="outline">Closed</Badge>,
};

function DataDisplay() {
  const [sort, setSort] = React.useState<{ key: 'match' | 'posted'; dir: Exclude<SortDirection, false> }>({ key: 'match', dir: 'desc' });
  const [selected, setSelected] = React.useState<string>('2');
  const sorted = [...jobs].sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * (a[sort.key] - b[sort.key]));
  const toggle = (key: 'match' | 'posted') =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  return (
    <Stack gap={8}>
      <Table stickyHeader aria-label="Matched jobs">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <span className="sr-only">Select</span>
            </TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Status</TableHead>
            <TableHead align="right" sort={sort.key === 'match' ? sort.dir : false} onSort={() => toggle('match')}>
              Match
            </TableHead>
            <TableHead align="right" sort={sort.key === 'posted' ? sort.dir : false} onSort={() => toggle('posted')}>
              Posted
            </TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((j) => (
            <TableRow key={j.id} interactive selected={selected === j.id} onClick={() => setSelected(j.id)}>
              <TableCell>
                <Checkbox aria-label={`Select ${j.role}`} checked={selected === j.id} onCheckedChange={() => setSelected(j.id)} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-strong">{j.role}</span>
                  <span className="text-label text-fg-subtle">{j.company}</span>
                </div>
              </TableCell>
              <TableCell muted>{j.location}</TableCell>
              <TableCell>{statusBadge[j.status]}</TableCell>
              <TableCell align="right">
                <span className={j.match >= 80 ? 'font-strong text-success-fg' : j.match >= 65 ? 'text-fg' : 'text-fg-subtle'}>{j.match}%</span>
              </TableCell>
              <TableCell align="right" muted>
                {j.posted}d ago
              </TableCell>
              <TableCell align="right">
                <IconButton label="More actions" icon={<MoreHorizontal />} size="sm" tooltip={false} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader
            icon={<Building2 />}
            title="Frontend Engineer"
            description="Razorpay · Bengaluru"
            actions={<IconButton label="Save job" icon={<Bookmark />} size="sm" />}
          />
          <CardContent className="flex flex-wrap gap-1.5">
            <Badge>React</Badge>
            <Badge>TypeScript</Badge>
            <Badge>GraphQL</Badge>
            <Badge tone="warning">Missing: Testing</Badge>
          </CardContent>
          <CardFooter>
            <span className="flex items-center gap-1 text-label text-fg-subtle">
              <MapPin className="size-3.5" aria-hidden="true" /> Hybrid
            </span>
            <Button size="sm" variant="primary" className="ml-auto">
              Apply
            </Button>
          </CardFooter>
        </Card>
        <Card variant="raised" padding="md" className="gap-4">
          <div className="flex items-center gap-4">
            <ProgressRing label="Profile completeness" value={72} size={56} thickness={5} showValue />
            <div className="flex flex-col">
              <span className="text-body-lg font-strong">Profile 72% complete</span>
              <span className="text-body text-fg-muted">Add work samples to reach 90%.</span>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-line pt-4">
            <ProgressRing label="Frontend readiness" value={88} size={32} tone="success" />
            <ProgressRing label="Backend readiness" value={46} size={32} tone="warning" />
            <ProgressRing label="Syncing" size={32} />
            <span className="ml-auto text-label text-fg-subtle">Readiness by role</span>
          </div>
        </Card>
        <Card interactive asChild selected>
          <button type="button" className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-body-lg font-strong">Steady plan</span>
              <Badge tone="accent" variant="solid">Selected</Badge>
            </div>
            <p className="mt-1 text-body text-fg-muted">1 hour a day. Ready for interviews in about 10 weeks.</p>
            <div className="mt-4 flex gap-1.5">
              <Badge tone="success" dot>On track</Badge>
              <Badge variant="outline">12 skills</Badge>
            </div>
          </button>
        </Card>
      </div>
      <Demo label="Badges">
        <Badge>Neutral</Badge>
        <Badge tone="accent">Accent</Badge>
        <Badge tone="success" dot>
          Success
        </Badge>
        <Badge tone="warning" dot>
          Warning
        </Badge>
        <Badge tone="danger" dot>
          Danger
        </Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge tone="accent" variant="solid">
          3
        </Badge>
        <Badge tone="danger" variant="solid" size="sm">
          99+
        </Badge>
      </Demo>
    </Stack>
  );
}

function Feedback() {
  const { toast } = useToast();
  return (
    <Stack gap={8}>
      <Demo label="Toasts">
        <Button onClick={() => toast({ title: 'Profile saved', tone: 'success' })}>Success</Button>
        <Button
          onClick={() =>
            toast({ title: 'Job archived', description: 'Removed from your feed.', action: { label: 'Undo', onClick: () => toast({ title: 'Restored' }) } })
          }
        >
          With action
        </Button>
        <Button onClick={() => toast({ title: 'Captcha needs you', description: 'Greenhouse · Postman', tone: 'warning' })}>Warning</Button>
        <Button onClick={() => toast({ title: 'Could not reach Naukri', description: 'We will retry in 5 minutes.', tone: 'danger' })}>Error</Button>
        <Button
          onClick={() => {
            const id = toast({ title: 'Applying to 3 jobs…', tone: 'loading' });
            setTimeout(() => toast({ id, title: 'Applied to 3 jobs', tone: 'success', duration: 4000 }), 1800);
          }}
        >
          Loading → done
        </Button>
      </Demo>
      <div className="grid grid-cols-3 gap-4">
        <Demo label="Skeleton" className="block">
          <Card padding="md" aria-busy="true" aria-label="Loading job">
            <div className="flex items-center gap-3">
              <Skeleton width={32} height={32} radius="md" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton width="60%" height={10} />
                <Skeleton width="35%" height={8} />
              </div>
            </div>
            <SkeletonText className="mt-4" lines={3} />
          </Card>
        </Demo>
        <Demo label="Empty state" className="block">
          <EmptyState
            bordered
            size="sm"
            icon={<Inbox />}
            title="No saved jobs yet"
            description="Save jobs from your feed to compare them here."
            actions={
              <Button size="sm" variant="primary" leftIcon={<Compass />}>
                Browse feed
              </Button>
            }
          />
        </Demo>
        <Demo label="Error state with recovery" className="block">
          <EmptyState
            bordered
            size="sm"
            tone="danger"
            icon={<WifiOff />}
            title="Feed did not load"
            description="Check your connection, then try again."
            actions={
              <Button size="sm" leftIcon={<RefreshCw />}>
                Retry
              </Button>
            }
          />
        </Demo>
      </div>
      <Demo label="Spinner">
        <Spinner size="xs" />
        <Spinner size="sm" />
        <Spinner />
        <Spinner size="lg" className="text-accent" />
        <span className="flex items-center gap-2 text-body text-fg-muted">
          <Spinner size="sm" label={null} /> Checking 214 sources…
        </span>
      </Demo>
    </Stack>
  );
}

function Overlays({ dialogOpen, drawerOpen }: { dialogOpen?: boolean; drawerOpen?: boolean }) {
  const [name, setName] = React.useState('Summer internships');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog defaultOpen={dialogOpen}>
        <DialogTrigger asChild>
          <Button leftIcon={<Pencil />}>Rename search</Button>
        </DialogTrigger>
        <DialogContent
          title="Rename saved search"
          description="Names are only visible to you."
          footer={
            <>
              <DialogClose asChild>
                <Button>Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="primary">Save</Button>
              </DialogClose>
            </>
          }
        >
          <Stack gap={4}>
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Switch label="Notify me about new matches" defaultChecked />
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="danger" leftIcon={<Trash2 />}>
            Delete…
          </Button>
        </DialogTrigger>
        <DialogContent
          size="sm"
          title="Delete 3 applications?"
          description="This removes them from tracking. Sent applications are not withdrawn."
          footer={
            <>
              <DialogClose asChild>
                <Button>Keep</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="danger">Delete</Button>
              </DialogClose>
            </>
          }
        >
          {null}
        </DialogContent>
      </Dialog>

      <Drawer defaultOpen={drawerOpen}>
        <DrawerTrigger asChild>
          <Button variant="secondary" leftIcon={<FileText />}>
            Review application
          </Button>
        </DrawerTrigger>
        <DrawerContent
          title="Frontend Engineer · Razorpay"
          description="Check the answers before we submit."
          headerExtra={
            <div className="flex gap-1.5">
              <Badge tone="success" dot>
                14 filled
              </Badge>
              <Badge tone="warning" dot>
                2 need you
              </Badge>
            </div>
          }
          footer={
            <>
              <Button>Save draft</Button>
              <Button variant="primary">Submit</Button>
            </>
          }
        >
          <Stack gap={4}>
            <Field label="Why do you want to work here?" error="Required by the form">
              <Textarea rows={4} placeholder="Write 2 or 3 sentences" />
            </Field>
            <Field label="Notice period">
              <Select
                placeholder="Choose"
                options={[
                  { value: '0', label: 'Immediate' },
                  { value: '30', label: '30 days' },
                  { value: '60', label: '60 days' },
                ]}
              />
            </Field>
            <Field label="Current CTC" hint="Filled from your profile">
              <Input defaultValue="₹ 12,00,000" rightSlot={<Copy className="size-3.5" />} />
            </Field>
          </Stack>
        </DrawerContent>
      </Drawer>

      <Tooltip content="Tooltips open on hover and keyboard focus" shortcut={['?']}>
        <Button variant="ghost">Hover or focus me</Button>
      </Tooltip>
    </div>
  );
}

/* ---------------------------------------------------------------- */

export function App() {
  const { theme, setTheme, resolvedTheme } = useTheme({ storageKey: forcedTheme ? null : 'nomadic.ui.showcase.theme', defaultTheme: forcedTheme ?? 'system' });
  const [collapsed, setCollapsed] = React.useState(false);
  const [active, setActive] = React.useState('foundations');

  const go = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className={collapsed ? 'flex h-12 items-center justify-center' : 'flex h-12 items-center px-4'}>
        {collapsed ? <NomadicMark className="h-4" /> : <NomadicLogo className="h-[18px]" />}
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3">
        <NavSection title="Components">
          {sections.map((s) => (
            <NavItem key={s.id} icon={s.icon} label={s.label} active={active === s.id} onClick={() => go(s.id)} />
          ))}
        </NavSection>
        <NavSection title="App">
          <NavItem icon={<Bell />} label="Notifications" trailing={<Badge tone="accent" size="sm">3</Badge>} />
          <NavItem icon={<Settings />} label="Settings" />
        </NavSection>
      </div>
      <div className="border-t border-line p-2">
        <NavItem
          icon={<PanelLeft />}
          label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((c) => !c)}
          shortcut={['Ctrl', 'B']}
        />
      </div>
    </div>
  );

  const topbar = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-body font-strong">Design system</span>
        <Badge variant="outline">v0.1</Badge>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Input size="sm" leftIcon={<Search />} placeholder="Search components" aria-label="Search components" wrapperClassName="w-60" rightSlot={<Kbd keys={['Ctrl', 'K']} size="sm" />} />
        <ThemeToggle theme={theme} setTheme={setTheme} />
      </div>
    </>
  );

  return (
    <AppShell sidebar={sidebar} topbar={topbar} sidebarCollapsed={collapsed} className="h-screen">
      <div className="mx-auto max-w-[1120px] px-8">
        <header className="flex flex-col gap-2 border-b border-line pb-8 pt-10">
          <span className="text-label font-strong text-accent">@nomadic/ui</span>
          <h1 className="text-display font-strong">Calm, dense, keyboard-first.</h1>
          <p className="max-w-[620px] text-body-lg text-fg-muted">
            One accent, a cool ink neutral scale, two weights and a 4 / 8 pt grid. Light and dark come from the same tokens. Every control works from the keyboard and respects reduced motion.
          </p>
        </header>
        <Section id="foundations" title="Foundations" description="Semantic tokens exposed as CSS variables and Tailwind classes (bg-surface, text-fg-muted, border-line, bg-accent).">
          <Foundations resolved={resolvedTheme} />
        </Section>
        <Section id="buttons" title="Buttons" description="Primary is reserved for the one main action in a view. Loading keeps focus and width, and blocks double submits.">
          <Buttons />
        </Section>
        <Section id="forms" title="Forms" description="Field wires the label, hint and error to the control. Errors are announced and set aria-invalid.">
          <Forms />
        </Section>
        <Section id="navigation" title="Navigation" description="Tabs follow the WAI-ARIA pattern. Kbd renders shortcuts with readable names for screen readers.">
          <Navigation />
        </Section>
        <Section id="data" title="Data display" description="Tables, cards, badges and progress. Sortable headers expose aria-sort.">
          <DataDisplay />
        </Section>
        <Section id="feedback" title="Feedback" description="Toasts for outcomes, skeletons for loading, empty and error states that always offer a next step.">
          <Feedback />
        </Section>
        <Section id="overlays" title="Overlays" description="Dialogs and drawers trap focus, close on Escape and return focus to the trigger.">
          <Overlays dialogOpen={params.get('open') === 'dialog'} drawerOpen={params.get('open') === 'drawer'} />
        </Section>
        <footer className="flex items-center justify-between py-8 text-label text-fg-subtle">
          <span>Nomadic design system</span>
          <HStack gap={1}>
            <span>Press</span> <Kbd>Tab</Kbd> <span>to walk every control</span>
          </HStack>
        </footer>
      </div>
    </AppShell>
  );
}
