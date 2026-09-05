import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { isNativePlatform, startNativeOAuth, listenForNativeSignIn } from '../lib/nativeAuth.js';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Error from a native (Capacitor) OAuth round-trip; surfaced by the login page
  const [nativeAuthError, setNativeAuthError] = useState('');

  // In the Android/iOS shell the OAuth provider returns to the app through a
  // deep link rather than a page load — listen for it for the app's lifetime.
  useEffect(() => {
    if (!isNativePlatform()) return undefined;
    return listenForNativeSignIn((message) => setNativeAuthError(message));
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email, password, userData = {}) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData
        }
      });
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const signInWithGoogle = async () => {
    try {
      setNativeAuthError('');
      if (isNativePlatform()) {
        // System browser + deep link back; the session shows up through
        // onAuthStateChange once the callback is processed.
        const data = await startNativeOAuth('google');
        return { data, error: null, pending: true };
      }
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      // 'local' signs out this device only. The default ('global') revokes every
      // session of the account, which kicks out the other tablets a venue runs
      // on the same login — possibly mid-match.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const resetPassword = async (email) => {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const updatePassword = async (newPassword) => {
    try {
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  // Stored under `display_name`: Supabase re-copies the Google identity
  // (full_name, name, …) into user_metadata on every OAuth sign-in, so an
  // edit to full_name alone would be reverted at the next login.
  const updateDisplayName = async (displayName) => {
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { display_name: displayName, full_name: displayName }
      });
      if (error) throw error;
      if (data?.user) setUser(data.user);
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const value = {
    user,
    loading,
    updateDisplayName,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    nativeAuthError,
    resetPassword,
    updatePassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
