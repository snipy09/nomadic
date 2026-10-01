import { CSSProperties, useState } from 'react';
import { JOBS, JOB_SOURCES } from '../content';

export default function JobFinder() {
  const [source, setSource] = useState('All');
  const shown = source === 'All' ? JOBS : JOBS.filter((job) => job.source === source);
  const countFor = (name: string) => (name === 'All' ? JOBS.length : JOBS.filter((job) => job.source === name).length);

  return (
    <div className="border-2 border-ink bg-white">
      <div
        role="group"
        aria-label="Filter by source"
        className="flex flex-wrap gap-x-6 border-b-2 border-ink bg-fog px-4 sm:px-5"
      >
        {JOB_SOURCES.map((name) => {
          const active = name === source;
          return (
            <button
              key={name}
              type="button"
              aria-pressed={active}
              onClick={() => setSource(name)}
              className={`shrink-0 border-b-4 py-3.5 text-[15px] font-semibold ${
                active ? 'border-ultra text-ink' : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {name}
              <span className="nums ml-1.5 text-ink-soft">{countFor(name)}</span>
            </button>
          );
        })}
      </div>

      <ul key={source} className="divide-y divide-rule" aria-live="polite">
        {shown.map((job, i) => (
          <li
            key={job.id}
            className="anim-slide grid grid-cols-[4.25rem_1fr] items-center gap-x-4 px-4 py-4 sm:grid-cols-[4.75rem_1fr_auto] sm:px-5"
            style={{ '--d': `${i * 55}ms` } as CSSProperties}
          >
            <div>
              <p className="nums wide text-2xl">{job.match}%</p>
              <div className="mt-1.5 h-1 bg-rule">
                <div className="h-full bg-ultra" style={{ width: `${job.match}%` }} />
              </div>
            </div>
            <div className="min-w-0">
              <p className="font-bold leading-tight">{job.role}</p>
              <p className="mt-0.5 text-sm text-ink-soft">
                {job.company}, {job.where}. Needs {job.skills}.
              </p>
            </div>
            <p className="col-span-2 mt-2 text-sm text-ink-soft sm:col-span-1 sm:mt-0 sm:text-right">
              <span className="block font-semibold text-ink">{job.source}</span>
              {job.posted}
            </p>
          </li>
        ))}
      </ul>

      <p className="border-t-2 border-ink bg-fog px-4 py-3 text-sm text-ink-soft sm:px-5">
        Sample listings. Match shows how closely each role fits the skills on your profile.
      </p>
    </div>
  );
}
