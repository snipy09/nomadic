// Launch email list. The publishable key is public by design: the table is locked by RLS
// and the only thing it can do is call `join_waitlist`, which inserts one address.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://grqkiddfwoyicktpgdea.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_VJRlzJA4faXs8PA2Ms3TWg_14n0hc85';

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function joinWaitlist(email: string, source: string): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/join_waitlist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({ p_email: email, p_source: source }),
  });

  if (!response.ok) throw new Error(`join_waitlist failed with ${response.status}`);
}
