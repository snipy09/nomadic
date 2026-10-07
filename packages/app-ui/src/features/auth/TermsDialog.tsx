import React, { useState } from 'react';
import { LEGAL_DOCS, LEGAL_UPDATED, type LegalDoc } from '@nomadic/config';
import { Button, Dialog, DialogContent, Tabs, TabsList, TabsTrigger } from '@nomadic/ui';

interface TermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown as a primary action when the user has not accepted yet. */
  onAccept?: () => void;
  accepted: boolean;
}

type DocId = keyof typeof LEGAL_DOCS;
const ORDER: Array<{ id: DocId; label: string }> = [
  { id: 'terms', label: 'Terms' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'refunds', label: 'Refunds' },
];

function DocBody({ doc }: { doc: LegalDoc }) {
  return (
    <ol className="flex flex-col gap-4">
      {doc.sections.map((s, i) => (
        <li key={s.title} className="flex flex-col gap-1">
          <h3 className="text-body font-strong text-fg">{i + 1}. {s.title}</h3>
          {s.paragraphs.map((p) => (
            <p key={p.slice(0, 40)} className="text-body text-fg-muted">{p}</p>
          ))}
        </li>
      ))}
    </ol>
  );
}

/** Terms, privacy and refund policy from @nomadic/config (same text as the website). */
export const TermsDialog: React.FC<TermsDialogProps> = ({ open, onOpenChange, onAccept, accepted }) => {
  const [tab, setTab] = useState<DocId>('terms');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Terms and privacy"
        description={`Please read these before using Nomadic. Last updated ${LEGAL_UPDATED}.`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
            {onAccept && !accepted && (
              <Button
                variant="primary"
                onClick={() => {
                  onAccept();
                  onOpenChange(false);
                }}
              >
                Accept terms and privacy policy
              </Button>
            )}
          </>
        }
      >
        <Tabs value={tab} onValueChange={(v) => setTab(v as DocId)} className="gap-4">
          <TabsList aria-label="Document">
            {ORDER.map((d) => <TabsTrigger key={d.id} value={d.id}>{d.label}</TabsTrigger>)}
          </TabsList>
          <DocBody doc={LEGAL_DOCS[tab]} />
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
