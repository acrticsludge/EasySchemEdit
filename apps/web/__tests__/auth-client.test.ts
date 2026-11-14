// apps/web/__tests__/auth-client.test.ts
// Unit tests for client auth API methods

import { getMe, login, register, logout } from '../src/client/auth-client.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running auth-client unit tests...');

const originalFetch = globalThis.fetch;

// 1. Test getMe() on authenticated response
{
  globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    assert(String(input).endsWith('/api/auth/me'), 'getMe should call /api/auth/me');
    return new Response(JSON.stringify({ user: { id: 'u-1', username: 'miner42' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const user = await getMe();
  assert(user !== null, 'getMe should return user when authenticated');
  assert(user?.id === 'u-1', 'user id should match');
  assert(user?.username === 'miner42', 'username should match');
}

// 2. Test getMe() on 401 unauthenticated
{
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const user = await getMe();
  assert(user === null, 'getMe should return null on 401');
}

// 3. Test getMe() on network error
{
  globalThis.fetch = async () => {
    throw new Error('Network failure');
  };

  const user = await getMe();
  assert(user === null, 'getMe should return null on network failure');
}

// 4. Test login() success
{
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    assert(String(input).endsWith('/api/auth/login'), 'login should call /api/auth/login');
    assert(init?.method === 'POST', 'login should use POST');
    const body = JSON.parse(init?.body as string);
    assert(body.username === 'miner42', 'login should send username');
    assert(body.password === 'secretpass', 'login should send password');

    return new Response(JSON.stringify({ user: { id: 'u-1', username: 'miner42' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const user = await login('miner42', 'secretpass');
  assert(user.id === 'u-1', 'login should return user id');
  assert(user.username === 'miner42', 'login should return username');
}

// 5. Test login() failure with error message
{
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ error: 'Invalid username or password' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  let threw = false;
  try {
    await login('miner42', 'wrongpass');
  } catch (err) {
    threw = true;
    assert(
      (err as Error).message === 'Invalid username or password',
      'login error message should match server response',
    );
  }
  assert(threw, 'login should throw on non-ok response');
}

// 6. Test register() success
{
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    assert(String(input).endsWith('/api/auth/register'), 'register should call /api/auth/register');
    assert(init?.method === 'POST', 'register should use POST');
    return new Response(JSON.stringify({ user: { id: 'u-2', username: 'newuser' } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const user = await register('newuser', 'strongpassword');
  assert(user.id === 'u-2', 'register should return user id');
  assert(user.username === 'newuser', 'register should return username');
}

// 7. Test register() failure with error message
{
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ error: 'Username already taken' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  let threw = false;
  try {
    await register('newuser', 'strongpassword');
  } catch (err) {
    threw = true;
    assert(
      (err as Error).message === 'Username already taken',
      'register error message should match server response',
    );
  }
  assert(threw, 'register should throw on error');
}

// 8. Test logout()
{
  let called = false;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/api/auth/logout')) {
      called = true;
      assert(init?.method === 'POST', 'logout should use POST');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  };

  await logout();
  assert(called, 'logout should call /api/auth/logout');
}

// Restore fetch
globalThis.fetch = originalFetch;

console.log('✓ All auth-client unit tests passed successfully!');
