import React from 'react';
import { Button, Dialog, DialogContent } from '@nomadic/ui';

interface TermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown as a primary action when the user has not accepted yet. */
  onAccept?: () => void;
  accepted: boolean;
}

// Plain statements of what the app actually does. Legal wording still needs the owner's review.
const SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: 'Your licence',
    body:
      'Nomadic gives you a personal, non-transferable licence to use the desktop app on the plan you hold (Free, Pro or Max). One account can be active on one computer at a time.',
  },
  {
    title: 'Applications',
    body:
      'Nomadic fills application forms in your browser using your profile. It always shows you the filled form and waits for your confirmation before anything is submitted. You are responsible for the accuracy of what you submit.',
  },
  {
    title: 'Learning content',
    body: 'Learning paths, lessons and links are provided to help you prepare for placements and interviews. Links point to third-party sites we do not control.',
  },
  {
    title: 'Your data',
    body:
      'Your profile, resumes and applications are stored on this computer and synced to your Nomadic account so they are available after a reinstall. We do not sell your data.',
  },
];

export const TermsDialog: React.FC<TermsDialogProps> = ({ open, onOpenChange, onAccept, accepted }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      title="Terms of service"
      description="Please read these before using Nomadic."
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
              Accept terms
            </Button>
          )}
        </>
      }
    >
      <ol className="flex flex-col gap-4">
        {SECTIONS.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-1">
            <h3 className="text-body font-strong text-fg">{i + 1}. {s.title}</h3>
            <p className="text-body text-fg-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </DialogContent>
  </Dialog>
);
