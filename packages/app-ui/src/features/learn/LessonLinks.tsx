import React from 'react';
import { MessageSquareText, PlayCircle } from 'lucide-react';
import { Button, useToast } from '@nomadic/ui';
import type { Intake, LearnTopic } from '@job-automator/learning';
import { getApi } from '../../types';
import { moduleById } from './catalog';
import { chatGptPrompt, chatGptUrl, youtubeSearchUrl } from './learnLinks';

export interface LessonLinksProps {
  topic: LearnTopic;
  /** The student's intake, so the search and prompt match their role, level and DSA language. */
  intake?: Partial<Pick<Intake, 'role' | 'aim' | 'language' | 'levels'>> | null;
  size?: 'sm' | 'md';
}

/** "Learn from YouTube" and "Learn from ChatGPT" for one lesson; both open outside the app. */
export function LessonLinks({ topic, intake, size = 'sm' }: LessonLinksProps) {
  const { toast } = useToast();
  const mod = moduleById(topic.module_id);
  const ctx = intake ?? {};

  const open = async (url: string) => {
    const res = await getApi().openExternalUrl(url);
    if (res && res.success === false) toast({ title: 'Could not open the link', description: res.error, tone: 'danger' });
  };

  const openChatGpt = async () => {
    const prompt = chatGptPrompt(topic, mod, ctx);
    // The ChatGPT app can drop the typed prompt, so it is also on the clipboard.
    const copied = await navigator.clipboard?.writeText(prompt).then(
      () => true,
      () => false
    );
    await open(chatGptUrl(prompt));
    if (copied) toast({ title: 'Prompt copied', description: 'Paste it if ChatGPT opens empty.', tone: 'success' });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size={size} variant="secondary" leftIcon={<PlayCircle />} onClick={() => void open(youtubeSearchUrl(topic, mod, ctx))}>
        Learn from YouTube
      </Button>
      <Button size={size} variant="secondary" leftIcon={<MessageSquareText />} onClick={() => void openChatGpt()}>
        Learn from ChatGPT
      </Button>
    </div>
  );
}
