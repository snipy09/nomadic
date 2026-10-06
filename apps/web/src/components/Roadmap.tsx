import { useState } from 'react';
import { ROADMAP, ROADMAP_STATUS_LABEL } from '../content';
import { useInView } from '../hooks';

export default function Roadmap() {
  const [activeId, setActiveId] = useState('week-2');
  const [ref, seen] = useInView<HTMLDivElement>(0.25);
  const node = ROADMAP.find((item) => item.id === activeId) ?? ROADMAP[0];

  return (
    <div ref={ref} className="grid border-2 border-ink bg-white md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <ul className="divide-y divide-rule border-b-2 border-ink md:border-b-0 md:border-r-2">
        {ROADMAP.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => setActiveId(item.id)}
                className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-4 px-4 py-4 text-left sm:px-5 ${
                  active ? 'bg-ultra text-white' : 'hover:bg-fog'
                }`}
              >
                <span>
                  <span className="block text-lg font-bold leading-tight">{item.title}</span>
                  <span className={`block text-sm ${active ? 'text-white/85' : 'text-ink-soft'}`}>
                    {item.level}
                  </span>
                </span>
                <span className="nums text-sm font-bold">
                  {item.status === 'active' ? `${item.progress}%` : ROADMAP_STATUS_LABEL[item.status]}
                </span>
                <span className={`col-span-2 mt-3 h-1.5 ${active ? 'bg-white/30' : 'bg-rule'}`}>
                  <span
                    className={`block h-full origin-left transition-transform duration-1000 ease-out ${
                      active ? 'bg-marigold' : 'bg-ultra'
                    }`}
                    style={{ transform: `scaleX(${seen ? item.progress / 100 : 0})` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div key={node.id} className="anim-fade p-5 sm:p-8">
        <p className="text-sm text-ink-soft">{node.level}</p>
        <h3 className="wide mt-1 text-3xl">{node.title}</h3>
        <p className="mt-4 max-w-md text-ink-soft">{node.description}</p>
        <p className="mt-6 text-sm font-bold">Study days</p>
        <ul className="mt-2 grid max-w-md grid-cols-1 gap-x-6 border-t border-rule sm:grid-cols-2">
          {node.skills.map((skill) => (
            <li key={skill} className="border-b border-rule py-2 font-semibold">
              {skill}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-ink-soft">
          {node.status === 'done' && 'Finished. Its quizzes come back as spaced reviews.'}
          {node.status === 'active' && `This week: ${node.progress}% done. Fall behind and re-plan the rest in one click.`}
          {node.status === 'next' && 'Starts next week, on the days you said you can study.'}
          {node.status === 'later' && 'Later in your plan. Each day keeps its own date.'}
        </p>
      </div>
    </div>
  );
}
