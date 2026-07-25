import type { AxiosRequestConfig } from 'axios';
import { http } from './http';

export class BaseService {
  protected async request<T>(config: AxiosRequestConfig): Promise<T> {
    const response = await http.request<T>(config);
    return response.data;
  }

  protected get<T>(url: string, config?: AxiosRequestConfig) {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  protected post<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  protected put<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  protected delete<T>(url: string, config?: AxiosRequestConfig) {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }
}

