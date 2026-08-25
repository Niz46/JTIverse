/**
 * JTIVERSE API CLIENT
 * -------------------
 * Single source of truth for every HTTP call to the NestJS API.
 * No component should call fetch() directly — all calls go through
 * the typed exports at the bottom of this file.
 *
 * TOKEN HANDLING:
 * Pass the Clerk session token via options.token. In server components
 * get it from: const { getToken } = auth(); const token = await getToken();
 * In client components get it from: const { getToken } = useAuth();
 *
 * ERROR HANDLING:
 * Non-2xx responses throw ApiError with the status code and the
 * parsed NestJS error body. Callers can catch ApiError specifically
 * to display the message field without crashing.
 */

import type {
  PublicContent,
  PublicUser,
  PublicComment,
  PublicTitle,
  ContentType,
} from "@anime-platform/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ============================================================
// CORE FETCH WRAPPER
// ============================================================

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: { message?: string; error?: string },
  ) {
    super(body?.message ?? body?.error ?? `API error ${status}`);
    this.name = "ApiError";
  }
}

interface FetchOptions extends RequestInit {
  /** Clerk JWT — omit for public endpoints */
  token?: string;
}

async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { token, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(rest.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers,
    // Next.js 15+ cache: opt out by default; callers can override
    cache: rest.cache ?? "no-store",
  });

  if (!res.ok) {
    let body: { message?: string; error?: string } = {};
    try {
      body = await res.json();
    } catch {
      // non-JSON error body — ignore
    }
    throw new ApiError(res.status, body);
  }

  // 204 No Content — return undefined cast to T
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ============================================================
// CONTENT
// ============================================================

export interface ContentCounts {
  anime: number;
  donghua: number;
  movie: number;
  total: number;
}

export interface ScoredContent extends PublicContent {
  score: number;
}

export const contentApi = {
  /** Catalog list — optionally filtered by type. Public endpoint. */
  list: (type?: ContentType, token?: string) =>
    apiFetch<PublicContent[]>(`/content${type ? `?type=${type}` : ""}`, {
      token,
    }),

  /** Single content item by id. Public endpoint. */
  getOne: (id: string, token?: string) =>
    apiFetch<PublicContent>(`/content/${id}`, { token }),

  /** Counts per type. Public endpoint. Used for stats banners. */
  getCounts: (token?: string) =>
    apiFetch<ContentCounts>("/content/stats/counts", { token }),

  /** Jaccard + AniList scored recommendations. Public endpoint. */
  getRecommendations: (id: string, limit = 10, token?: string) =>
    apiFetch<ScoredContent[]>(`/content/${id}/recommendations?limit=${limit}`, {
      token,
    }),
};

// ============================================================
// USERS
// ============================================================

/** Full self-profile including tokenBalance, ownedTitles — requires auth */
export interface MeResponse extends PublicUser {
  email: string;
  hasCompletedOnboarding: boolean;
  ownedTitles: Array<{
    id: string;
    unlockedAt: string;
    title: PublicTitle;
  }>;
}

export const usersApi = {
  /** Authenticated user's own full profile */
  getMe: (token: string) => apiFetch<MeResponse>("/users/me", { token }),

  /** Update own bio / avatarUrl / gender */
  updateMe: (
    token: string,
    data: { bio?: string | null; avatarUrl?: string | null; gender?: string },
  ) =>
    apiFetch<
      Pick<PublicUser, "id" | "username" | "gender" | "avatarUrl" | "bio">
    >("/users/me", { method: "PATCH", body: JSON.stringify(data), token }),

  /** Public profile for any user by id — no auth required */
  getPublicProfile: (id: string) => apiFetch<PublicUser>(`/users/${id}`),
};

// ============================================================
// TITLES SHOP
// ============================================================

export interface ShopTitle extends PublicTitle {
  sortOrder: number;
  owned: boolean;
}

export const titlesApi = {
  /** Full shop catalog, with owned: boolean per title */
  getCatalog: (token?: string) =>
    apiFetch<ShopTitle[]>("/titles-shop", { token }),

  /** Purchase a title by id — requires auth */
  purchase: (titleId: string, token: string) =>
    apiFetch<{ userTitleId: string; newBalance: number }>(
      `/titles-shop/${titleId}/purchase`,
      { method: "POST", token },
    ),

  /** Equip an owned title — requires auth */
  equip: (userTitleId: string, token: string) =>
    apiFetch<{ equipped: true; userTitleId: string }>(
      `/titles/${userTitleId}/equip`,
      { method: "POST", token },
    ),

  /** Unequip current title — requires auth */
  unequip: (token: string) =>
    apiFetch<{ unequipped: true }>("/titles/unequip", {
      method: "POST",
      token,
    }),
};

// ============================================================
// COMMENTS
// ============================================================

export const commentsApi = {
  /** List approved comments for a content item. Public endpoint. */
  list: (contentId: string, page = 1, pageSize = 20, token?: string) =>
    apiFetch<{
      items: PublicComment[];
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    }>(`/content/${contentId}/comments?page=${page}&pageSize=${pageSize}`, {
      token,
    }),

  /** Post a new comment — requires auth */
  create: (contentId: string, body: string, token: string) =>
    apiFetch<PublicComment>(`/content/${contentId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
      token,
    }),

  /** Delete own comment — requires auth */
  remove: (contentId: string, commentId: string, token: string) =>
    apiFetch<{ deleted: true }>(`/content/${contentId}/comments/${commentId}`, {
      method: "DELETE",
      token,
    }),

  /** Report a comment — requires auth */
  report: (
    contentId: string,
    commentId: string,
    reason: string,
    token: string,
  ) =>
    apiFetch<{ reported: true }>(
      `/content/${contentId}/comments/${commentId}/report`,
      { method: "POST", body: JSON.stringify({ reason }), token },
    ),
};

// ============================================================
// ADMIN
// ============================================================

export interface AdminOverview {
  totalUsers: number;
  totalContent: number;
  totalComments: number;
  totalTokensGranted: number;
  activeRooms: number;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  isBanned: boolean;
  isShadowbanned: boolean;
  tokenBalance: number;
  createdAt: string;
}

export const adminApi = {
  getOverview: (token: string) =>
    apiFetch<AdminOverview>("/admin/overview", { token }),

  listUsers: (
    token: string,
    params?: {
      search?: string;
      role?: string;
      isBanned?: boolean;
      page?: number;
    },
  ) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.role) q.set("role", params.role);
    if (params?.isBanned !== undefined)
      q.set("isBanned", String(params.isBanned));
    if (params?.page) q.set("page", String(params.page));
    return apiFetch<{
      items: AdminUser[];
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    }>(`/admin/users?${q}`, { token });
  },

  getUser: (id: string, token: string) =>
    apiFetch<AdminUser>(`/admin/users/${id}`, { token }),

  banUser: (id: string, banned: boolean, token: string) =>
    apiFetch<{ banned: boolean }>(`/admin/users/${id}/ban`, {
      method: "PATCH",
      body: JSON.stringify({ banned }),
      token,
    }),

  setRole: (id: string, role: string, token: string) =>
    apiFetch<{ role: string }>(`/admin/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
      token,
    }),
};
