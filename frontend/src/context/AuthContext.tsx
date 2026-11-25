import { createContext, useContext, useState, type ReactNode } from 'react';
import type { LoginCredentials, PapelUsuario, User } from '../types/auth';
import { getActiveToken, postGerarToken, postLogin } from '../services/venueApi';

interface AuthContextType {
  user: User | null;
  token: string;
  isAuthenticated: boolean;
  loading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  loginComPapel: (usuario: string, papel: PapelUsuario) => Promise<void>;
  usarTokenPadrao: () => void;
  logout: () => void;
}

const DEFAULT_USER: User = {
  id: 'usr-dev',
  name: 'Operador RAIZ',
  email: 'operador@raizevento.com',
  role: 'admin',
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem('@venue-intelligence:user');
    if (!storedUser) return DEFAULT_USER;
    try {
      return JSON.parse(storedUser) as User;
    } catch {
      return DEFAULT_USER;
    }
  });
  const [token, setToken] = useState<string>(() => getActiveToken());
  const [loading, setLoading] = useState(false);

  const login = async (credentials: LoginCredentials) => {
    setLoading(true);
    try {
      const data = await postLogin(credentials);
      localStorage.setItem('@venue-intelligence:token', data.token);
      localStorage.setItem('@venue-intelligence:user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  };

  const loginComPapel = async (usuario: string, papel: PapelUsuario) => {
    setLoading(true);
    try {
      const data = await postGerarToken({ usuario, papel });
      const newUser: User = {
        id: `usr-${usuario}`,
        name: usuario,
        email: `${usuario}@raizevento.com`,
        role: data.papel,
      };
      localStorage.setItem('@venue-intelligence:token', data.access_token);
      localStorage.setItem('@venue-intelligence:user', JSON.stringify(newUser));
      setToken(data.access_token);
      setUser(newUser);
    } finally {
      setLoading(false);
    }
  };

  const usarTokenPadrao = () => {
    localStorage.removeItem('@venue-intelligence:token');
    localStorage.removeItem('@venue-intelligence:user');
    setToken(getActiveToken());
    setUser(DEFAULT_USER);
  };

  const logout = () => {
    usarTokenPadrao();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        loading,
        login,
        loginComPapel,
        usarTokenPadrao,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// oxlint-disable-next-line react/only-export-components
export const useAuth = () => useContext(AuthContext);
