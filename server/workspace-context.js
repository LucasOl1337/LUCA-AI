import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function runWithWorkspaceUser(userId, fn, role = 'user') {
  const id = String(userId || '').trim();
  if (!id) throw new Error('workspace_user_required');
  return storage.run({ userId: id, role: String(role || 'user') }, fn);
}

export function getWorkspaceUserId() {
  return storage.getStore()?.userId || null;
}

export function getWorkspaceRole() {
  return storage.getStore()?.role || null;
}

export function isWorkspaceAdmin() {
  return getWorkspaceRole() === 'admin';
}

export function requireWorkspaceUserId() {
  const userId = getWorkspaceUserId();
  if (!userId) throw new Error('workspace_user_required');
  return userId;
}
