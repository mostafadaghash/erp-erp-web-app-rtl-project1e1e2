import { createContext, useContext } from "react";
import type { Permission } from "../../convex/lib/permissions";

const PermissionContext = createContext<ReadonlySet<Permission>>(new Set());

export function PermissionProvider({
  permissions,
  children,
}: {
  permissions: Permission[];
  children: React.ReactNode;
}) {
  return (
    <PermissionContext.Provider value={new Set(permissions)}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermission(permission: Permission): boolean {
  return useContext(PermissionContext).has(permission);
}
