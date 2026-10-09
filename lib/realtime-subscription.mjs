/**
 * One cancellable subscription. Disposal can happen while auth is still pending;
 * late auth/status/change callbacks must not recreate it or refresh old accounts.
 * @param {{
 * client: import('@supabase/supabase-js').SupabaseClient,
 * userId: string,
 * name: string,
 * tables: string[],
 * onChange: () => void,
 * onStatus?: (status: string) => void
 * }} options
 */
export function realtimeSubscription({ client, userId, name, tables, onChange, onStatus = () => {} }) {
  let disposed = false;
  /** @type {import('@supabase/supabase-js').RealtimeChannel | null} */
  let channel = null;
  /** @type {Promise<unknown> | null} */
  let removal = null;
  const ready = (async () => {
    const { data: { session }, error } = await client.auth.getSession();
    if (disposed) return;
    if (error) throw error;
    if (!session || session.user.id !== userId) return;
    await client.realtime.setAuth(session.access_token);
    if (disposed) return;
    channel = client.channel(name);
    for (const table of tables) {
      channel.on('postgres_changes', {
        event: '*', schema: 'public', table, filter: `user_id=eq.${userId}`,
      }, () => { if (!disposed) onChange(); });
    }
    channel.subscribe((status) => { if (!disposed) onStatus(status); });
  })();
  return {
    ready,
    dispose() {
      disposed = true;
      if (!removal && channel) {
        removal = client.removeChannel(channel);
        channel = null;
      }
      return removal || Promise.resolve();
    },
  };
}
