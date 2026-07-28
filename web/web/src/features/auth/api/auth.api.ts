import { apiClient } from '@/lib/api-client';
import type { LoginRequest, LoginResponse } from '../types';

export const authApi = {
    login: (payload: LoginRequest) =>
        apiClient.post<LoginResponse>('/api/auth/login', payload, {
            skipAuth: true, // 登录接口不需要带 access token
        }),

    logout: () => apiClient.post<void>('/api/auth/logout'),
};