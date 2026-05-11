export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  farmId: string | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
  user: AuthUser;
}
