import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../services/api';

type User = {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('streamweaver-token');
    const savedUser = localStorage.getItem('streamweaver-user');

    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    }

    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('streamweaver-user');
        setUser(null);
      }
    } else if (token) {
      try {
        const base64Payload = token.split('.')[1];
        if (base64Payload) {
          const payload = JSON.parse(atob(base64Payload.replace(/-/g, '+').replace(/_/g, '/')));
          setUser({
            id: payload.id || 'user',
            name: payload.name || payload.email || 'User',
            email: payload.email || '',
            role: payload.role || 'user'
          });
        }
      } catch {
        setUser(null);
      }
    } else {
      setUser(null);
    }

    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, { email, password });
    const user = response.data.user;
    localStorage.setItem('streamweaver-token', response.data.token);
    localStorage.setItem('streamweaver-user', JSON.stringify(user));
    axios.defaults.headers.common.Authorization = `Bearer ${response.data.token}`;
    setUser(user);
  };

  const register = async (name: string, email: string, password: string) => {
    const response = await axios.post(`${API_BASE_URL}/auth/register`, { name, email, password });
    const user = response.data.user;
    localStorage.setItem('streamweaver-token', response.data.token);
    localStorage.setItem('streamweaver-user', JSON.stringify(user));
    axios.defaults.headers.common.Authorization = `Bearer ${response.data.token}`;
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('streamweaver-token');
    localStorage.removeItem('streamweaver-user');
    delete axios.defaults.headers.common.Authorization;
    setUser(null);
  };

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
