export const API = "http://localhost:3001/api";

export function apiFetch(url, options = {}) {
  const token = sessionStorage.getItem("perugineToken");
  return fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
}

export function can(user, permission) {
  if (user?.permissoes?.[permission]) return true;
  if (permission === "finance.manage" && user?.permissoes?.["users.manage"]) return true;
  const [area, action] = permission.split(".");
  return action === "view" && Boolean(user?.permissoes?.[`${area}.manage`]);
}
