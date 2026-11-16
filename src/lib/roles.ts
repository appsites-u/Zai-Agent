export type AppRole = "admin" | "operator" | "viewer";
export type Access = "member" | "writer" | "admin";

/** Single source of truth for which roles satisfy an access level. Mirrors the DB helpers is_member / can_write / has_role. */
export function roleAllows(roles: readonly string[] | null | undefined, need: Access): boolean {
  const r = new Set(roles ?? []);
  if (need === "admin") return r.has("admin");
  if (need === "writer") return r.has("admin") || r.has("operator");
  return r.has("admin") || r.has("operator") || r.has("viewer");
}

export function primaryRole(roles: readonly string[] | null | undefined): AppRole | null {
  if (!roles?.length) return null;
  if (roles.includes("admin")) return "admin";
  if (roles.includes("operator")) return "operator";
  if (roles.includes("viewer")) return "viewer";
  return null;
}
