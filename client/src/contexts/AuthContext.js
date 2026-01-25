import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const initSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session;

      if (error) {
        console.error('🔴 Error checking session:', error.message);
        setUser(null);
      } else {
        setUser(session?.user || null);
      }

      setAuthLoading(false);
    };

    initSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('🔄 Auth state change:', _event, session ? 'session present' : 'no session');
      setUser(session?.user || null);
    });

    // Add visibility change listener to check and refresh session when tab becomes active
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        console.log('🔄 Tab became visible, checking session...');
        try {
          const { data: currentSession } = await supabase.auth.getSession();
          if (currentSession.session) {
            console.log('🔄 Refreshing existing session...');
            const { data, error } = await supabase.auth.refreshSession();
            if (error) {
              console.error('❌ Error refreshing session:', error.message);
            } else if (data.session) {
              console.log('✅ Session refreshed successfully');
              setUser(data.session.user);
            }
          } else {
            console.log('⚠️ No active session found');
            setUser(null);
          }
        } catch (err) {
          console.error('❌ Failed to check session:', err.message);
          setUser(null);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      listener.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, authLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => useContext(AuthContext);
