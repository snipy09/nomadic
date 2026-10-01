import { useState } from 'react';
import { BOARD_STAGES, BOARD_START, BoardCard } from '../content';

export default function Board() {
  const [cards, setCards] = useState<BoardCard[]>(BOARD_START);
  const [moved, setMoved] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const changed = cards.some((card, i) => card.stage !== BOARD_START[i].stage);

  const advance = (card: BoardCard) => {
    setCards((current) => current.map((c) => (c.id === card.id ? { ...c, stage: c.stage + 1 } : c)));
    setMoved(card.id);
    setMessage(`${card.company} moved to ${BOARD_STAGES[card.stage + 1]}.`);
  };

  const reset = () => {
    setCards(BOARD_START);
    setMoved(null);
    setMessage('Board reset.');
  };

  return (
    <div>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3 pb-4">
        <p className="text-ink-soft">Move a card forward to see the board update.</p>
        {changed && (
          <button type="button" onClick={reset} className="font-bold underline decoration-2 underline-offset-4">
            Reset board
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[62rem] grid-cols-5 border-2 border-ink bg-white lg:min-w-0">
          {BOARD_STAGES.map((name, stage) => {
            const column = cards.filter((card) => card.stage === stage);
            return (
              <section
                key={name}
                aria-label={`${name}, ${column.length} applications`}
                className="min-h-[19rem] border-l-2 border-ink first:border-l-0"
              >
                <header className="flex items-baseline justify-between border-b-2 border-ink bg-fog px-3 py-3">
                  <h3 className="font-bold">{name}</h3>
                  <span className="nums text-sm font-bold">{column.length}</span>
                </header>
                <ul className="space-y-3 p-3">
                  {column.map((card) => (
                    <li
                      key={card.id}
                      className={`border border-ink p-3 ${moved === card.id ? 'anim-slide' : ''}`}
                    >
                      <p className="font-bold leading-tight">{card.company}</p>
                      <p className="text-sm">{card.role}</p>
                      <p className="mt-1 text-sm text-ink-soft">{card.note}</p>
                      {stage < BOARD_STAGES.length - 1 && (
                        <button
                          type="button"
                          onClick={() => advance(card)}
                          className="mt-3 text-sm font-bold text-ultra underline decoration-2 underline-offset-4 hover:text-ink"
                        >
                          Move to {BOARD_STAGES[stage + 1]}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
