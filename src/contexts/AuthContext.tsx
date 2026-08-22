import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole, Profile } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
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

  // 🔥 THIS is the key fix
  const manualLogout = useRef(false);

  const fetchUserData = async (userId: string) => {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      setProfile(profileData ?? null);

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      setRole((roleData?.role as AppRole) ?? null);
    } catch (err) {
      console.error('User data error:', err);
      setProfile(null);
      setRole(null);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {

        // INITIAL LOAD / LOGIN
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          manualLogout.current = false;

          setSession(currentSession);
          setUser(currentSession?.user ?? null);

          if (currentSession?.user) {
            await fetchUserData(currentSession.user.id);
          }

          setLoading(false);
          return;
        }

        // LOGOUT — ONLY if user clicked logout
        if (event === 'SIGNED_OUT') {
          if (!manualLogout.current) {
            // ignore refresh / token rehydrate
            setLoading(false);
            return;
          }

          setSession(null);
          setUser(null);
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    return await supabase.auth.signInWithPassword({ email, password });
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

  // ✅ LOGOUT THAT ACTUALLY WORKS
  const signOut = async () => {
    manualLogout.current = true;
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
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
