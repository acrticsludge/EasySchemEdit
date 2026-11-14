// apps/web/src/client/auth-client.ts
// Typed client fetch wrappers for EasySchemEdit authentication API.

export interface AuthUser {
  id: string;
  username: string;
}

/**
 * Fetch current authenticated user from session cookie.
 * Returns null if unauthenticated or on 401.
 */
export async function getMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    if (res.status === 401 || !res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      user?: AuthUser;
      id?: string;
      username?: string;
    };
    if (data.user && typeof data.user.id === 'string' && typeof data.user.username === 'string') {
      return data.user;
    }
    if (typeof data.id === 'string' && typeof data.username === 'string') {
      return { id: data.id, username: data.username };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Authenticate with existing credentials.
 * Throws descriptive Error on failure.
 */
export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    let message = 'Login failed';
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body.error) {
        message = body.error;
      } else if (body.message) {
        message = body.message;
      }
    } catch {
      message = `Login failed (${res.status} ${res.statusText})`;
    }
    throw new Error(message);
  }

  const data = (await res.json()) as {
    user?: AuthUser;
    id?: string;
    username?: string;
  };
  if (data.user && typeof data.user.id === 'string' && typeof data.user.username === 'string') {
    return data.user;
  }
  if (typeof data.id === 'string' && typeof data.username === 'string') {
    return { id: data.id, username: data.username };
  }
  throw new Error('Invalid response received from auth server');
}

/**
 * Register a new user account.
 * Throws descriptive Error on failure.
 */
export async function register(username: string, password: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    let message = 'Registration failed';
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body.error) {
        message = body.error;
      } else if (body.message) {
        message = body.message;
      }
    } catch {
      message = `Registration failed (${res.status} ${res.statusText})`;
    }
    throw new Error(message);
  }

  const data = (await res.json()) as {
    user?: AuthUser;
    id?: string;
    username?: string;
  };
  if (data.user && typeof data.user.id === 'string' && typeof data.user.username === 'string') {
    return data.user;
  }
  if (typeof data.id === 'string' && typeof data.username === 'string') {
    return { id: data.id, username: data.username };
  }
  throw new Error('Invalid response received from auth server');
}

/**
 * End the current session.
 */
export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch {
    // Non-fatal if server or network unreachable
  }
}
