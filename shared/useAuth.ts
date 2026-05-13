import { useEffect, useState, useCallback } from 'react';
import * as api from './api';

export interface AuthState {
  isLoading: boolean;
  isSignout: boolean;
  userToken: string | null;
  user: api.User | null;
}

export interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export function useAuth() {
  const [state, dispatch] = useState<AuthState>({
    isLoading: true,
    isSignout: false,
    userToken: null,
    user: null,
  });

  // Restore token on mount.
  //
  // Flow:
  //   1. `api.bootstrapAuth()` reads the persisted session from AsyncStorage
  //      and applies the two-rule policy:
  //        - Absolute: more than 30 days since first login → expire
  //        - Rolling:  more than 7 days since last app open → expire
  //      If valid, it advances lastSeenAt = now (rolling extension) and
  //      restores `authToken` + `refreshToken` into memory; otherwise it
  //      clears everything.
  //   2. If we have tokens, call /users/me to validate them server-side.
  //      If that 401s, the api client auto-tries /auth/refresh once. If
  //      that also fails, we clear storage and route to login.
  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const restored = await api.bootstrapAuth();
        if (!restored) {
          // No session, or expired by 7d/30d rules — go to login.
          dispatch({
            isLoading: false,
            isSignout: true,
            userToken: null,
            user: null,
          });
          return;
        }

        const token = api.getAuthToken();
        try {
          const user = await api.getMe();
          dispatch({
            isLoading: false,
            isSignout: false,
            userToken: token,
            user,
          });
        } catch (e) {
          // Server rejected the token even though our local clock said it was
          // valid — most likely server-side revocation or JWT_SECRET rotation.
          // The api client already tried /auth/refresh once; if we land here,
          // we have to send the user back to login.
          console.error('Server rejected restored token:', e);
          await api.logout();
          dispatch({
            isLoading: false,
            isSignout: true,
            userToken: null,
            user: null,
          });
        }
      } catch (e) {
        console.error('Bootstrap error:', e);
        dispatch({
          isLoading: false,
          isSignout: true,
          userToken: null,
          user: null,
        });
      }
    };

    bootstrapAsync();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    dispatch({ isLoading: true, isSignout: false, userToken: null, user: null });
    try {
      const result = await api.login(email, password);
      const user = await api.getMe();
      dispatch({
        isLoading: false,
        isSignout: false,
        userToken: result.token,
        user,
      });
    } catch (error) {
      console.error('Sign in error:', error);
      dispatch({
        isLoading: false,
        isSignout: false,
        userToken: null,
        user: null,
      });
      throw error;
    }
  }, []);

  const signUp = useCallback(
    async (email: string, username: string, password: string) => {
      dispatch({ isLoading: true, isSignout: false, userToken: null, user: null });
      try {
        const result = await api.register(email, username, password);
        const user = await api.getMe();
        dispatch({
          isLoading: false,
          isSignout: false,
          userToken: result.token,
          user,
        });
      } catch (error) {
        console.error('Sign up error:', error);
        dispatch({
          isLoading: false,
          isSignout: false,
          userToken: null,
          user: null,
        });
        throw error;
      }
    },
    []
  );

  const signInAsGuest = useCallback(async () => {
    dispatch({ isLoading: true, isSignout: false, userToken: null, user: null });
    try {
      const result = await api.createGuestSession();
      dispatch({
        isLoading: false,
        isSignout: false,
        userToken: result.token,
        user: null,
      });
    } catch (error) {
      console.error('Guest sign in error:', error);
      dispatch({
        isLoading: false,
        isSignout: false,
        userToken: null,
        user: null,
      });
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    dispatch({ isLoading: true, isSignout: false, userToken: null, user: null });
    try {
      await api.logout();
      dispatch({
        isLoading: false,
        isSignout: true,
        userToken: null,
        user: null,
      });
    } catch (error) {
      console.error('Sign out error:', error);
      dispatch({
        isLoading: false,
        isSignout: false,
        userToken: null,
        user: null,
      });
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const user = await api.getMe();
      dispatch((prevState) => ({
        ...prevState,
        user,
      }));
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, []);

  return {
    ...state,
    signIn,
    signUp,
    signOut,
    signInAsGuest,
    refreshUser,
  };
}
