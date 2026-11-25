export type PapelUsuario = 'visualizador' | 'operador' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer' | 'operador' | 'visualizador';
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface TokenIssueRequest {
  usuario: string;
  papel: PapelUsuario;
}

export interface TokenIssueResponse {
  access_token: string;
  token_type: 'bearer';
  expira_em_seg: number;
  papel: PapelUsuario;
}
