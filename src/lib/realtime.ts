let counter = 0;

/**
 * Unique realtime channel name. supabase-js reuses a channel with the same name, so two
 * screens using one hook would share it — and the first to close would cut the other off.
 */
export const channelName = (base: string) => `${base}-${++counter}-${Math.random().toString(36).slice(2, 7)}`;
