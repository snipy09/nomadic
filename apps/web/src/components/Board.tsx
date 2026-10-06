import { useRef, useState } from 'react';
import { BOARD_STAGES, BOARD_START, BoardCard } from '../content';
import { prefersReducedMotion, useIsoLayoutEffect } from '../hooks';

const EASE = 'cubic-bezier(0.2, 0.7, 0.1, 1)';

export default function Board() {
  const [cards, setCards] = useState<BoardCard[]>(BOARD_START);
  const [message, setMessage] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);
  const moved = useRef<string | null>(null);
  const changed = cards.some((card, i) => card.stage !== BOARD_START[i].stage);

  // FLIP: note where every card is now, let React move them, then slide each one from the old spot to the new.
  const snapshot = () => {
    const rects = new Map<string, DOMRect>();
    root.current?.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => {
      rects.set(el.dataset.card as string, el.getBoundingClientRect());
    });
    before.current = rects;
  };

  useIsoLayoutEffect(() => {
    const previous = before.current;
    before.current = null;
    if (!previous || prefersReducedMotion()) return;

    root.current?.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => {
      const id = el.dataset.card as string;
      const from = previous.get(id);
      if (!from || typeof el.animate !== 'function') return;
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (!dx && !dy) return;
      const arrived = id === moved.current;
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)`, backgroundColor: arrived ? '#FFC21A' : 'transparent' },
          { transform: 'none', backgroundColor: 'transparent' },
        ],
        { duration: arrived ? 640 : 480, easing: EASE },
      );
    });
  }, [cards]);

  const advance = (card: BoardCard) => {
    snapshot();
    moved.current = card.id;
    setCards((current) => current.map((c) => (c.id === card.id ? { ...c, stage: c.stage + 1 } : c)));
    setMessage(`${card.company} moved to ${BOARD_STAGES[card.stage + 1]}.`);
  };

  const reset = () => {
    snapshot();
    moved.current = null;
    setCards(BOARD_START);
    setMessage('Board reset.');
  };

  return (
    <div ref={root}>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 pb-4">
        <p className="text-ink-soft">Move a card forward to see the board update.</p>
        {/* Always in the layout, so the board does not jump when it first appears. */}
        <button
          type="button"
          onClick={reset}
          className={`inline-flex min-h-11 items-center font-bold underline decoration-2 underline-offset-4 ${
            changed ? '' : 'invisible'
          }`}
        >
          Reset board
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[52rem] grid-cols-4 border-2 border-ink bg-white lg:min-w-0">
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
                    <li key={card.id} data-card={card.id} className="border border-ink p-3">
                      <p className="font-bold leading-tight">{card.company}</p>
                      <p className="text-sm">{card.role}</p>
                      <p className="mt-1 text-sm text-ink-soft">{card.note}</p>
                      {stage < BOARD_STAGES.length - 1 && (
                        <button
                          type="button"
                          onClick={() => advance(card)}
                          className="mt-1 inline-flex min-h-11 items-center text-sm font-bold text-ultra underline decoration-2 underline-offset-4 hover:text-ink"
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
