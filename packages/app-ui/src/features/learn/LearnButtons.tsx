import React from 'react';
import { MessageSquareText, PlayCircle } from 'lucide-react';
import { Button, cn, useToast } from '@nomadic/ui';
import { getApi } from '../../types';
import { chatGptUrl, youtubeSearchUrl } from './learnLinks';

/** "YouTube" and "ChatGPT" for one topic or step; both open outside the app. The prompt is also copied. */
export function LearnButtons({ name, search, prompt, size = 'sm', className }: { name: string; search: string; prompt: string; size?: 'sm' | 'md'; className?: string }) {
  const { toast } = useToast();
  const open = async (url: string) => {
    const res = await getApi().openExternalUrl(url);
    if (res && res.success === false) toast({ title: 'Could not open the link', description: res.error, tone: 'danger' });
  };
  const openChatGpt = async () => {
    // The ChatGPT app can drop the typed prompt, so it is also on the clipboard.
    const copied = await navigator.clipboard?.writeText(prompt).then(
      () => true,
      () => false
    );
    await open(chatGptUrl(prompt));
    if (copied) toast({ title: 'Prompt copied', description: 'Paste it if ChatGPT opens empty.', tone: 'success' });
  };
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <Button size={size} variant="secondary" leftIcon={<PlayCircle />} aria-label={`Learn ${name} on YouTube`} onClick={() => void open(youtubeSearchUrl(search || name))}>
        YouTube
      </Button>
      <Button size={size} variant="secondary" leftIcon={<MessageSquareText />} aria-label={`Learn ${name} with ChatGPT`} onClick={() => void openChatGpt()}>
        ChatGPT
      </Button>
    </div>
  );
}
