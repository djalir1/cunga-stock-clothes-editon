import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import type { AppRole, Profile } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  /** Owner and storekeeper can change shop data; admin is view-only */
  canEdit: boolean;
  isOwner: boolean;
  /** Owner or admin: team, shop settings, exchange rates, cancelling sales */
  isManager: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // Which user's data we last loaded, so token refreshes don't refetch or flash the loader
  const loadedFor = useRef<string | null>(null);

  const fetchUserData = async (userId: string) => {
    const [{ data: profileData, error: profileError }, { data: roleData, error: roleError }] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
    ]);
    if (profileError) console.error('Profile load error:', profileError);
    // A failed lookup must not look like "no role yet" (that shows the waiting-for-approval screen)
    if (roleError) throw roleError;
    setProfile(profileData ?? null);
    setRole((roleData?.role as AppRole) ?? null);
  };

  useEffect(() => {
    let cancelled = false;

    const applySession = async (currentSession: Session | null) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (!currentSession?.user) {
        loadedFor.current = null;
        setProfile(null);
        setRole(null);
        setLoading(false);
        return;
      }
      if (loadedFor.current === currentSession.user.id) { setLoading(false); return; }

      setLoading(true);
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          await fetchUserData(currentSession.user.id);
          loadedFor.current = currentSession.user.id;
          break;
        } catch (err) {
          console.error('User data error:', err);
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        }
      }
      if (!cancelled) setLoading(false);
    };

    // Supabase: never await other supabase calls inside this callback — it runs while
    // the auth lock is held, so queries can go out without the session. Defer instead.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setTimeout(() => { if (!cancelled) applySession(currentSession); }, 0);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    // Show the loader until the account (role) is loaded, so the app goes straight to the dashboard
    setLoading(true);
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setLoading(false);
    return result;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    return await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
  };

  const signOut = async () => {
    // Sign out everywhere; if the server can't be reached, at least sign out on this device
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: 'local' });
    queryClient.clear(); // the next person on this phone never sees the previous person's data
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        canEdit: role === 'owner' || role === 'admin' || role === 'storekeeper',
        isOwner: role === 'owner',
        isManager: role === 'owner' || role === 'admin',
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
