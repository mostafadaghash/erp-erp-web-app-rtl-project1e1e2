export type WorkspaceTabKind = "singleton" | "new" | "entity" | "report";

export interface WorkspaceTab<Page extends string = string> {
  id: string;
  page: Page;
  title: string;
  group: string;
  identityKey: string;
  kind: WorkspaceTabKind;
  dirty: boolean;
  restoreSafe: boolean;
  createdAt: number;
  lastActiveAt: number;
  entityId?: string;
  payload?: Record<string, unknown>;
}

export interface PersistedWorkspaceTab<Page extends string = string> {
  page: Page;
  title: string;
  group: string;
  identityKey: string;
  kind: Exclude<WorkspaceTabKind, "new">;
  entityId?: string;
  payload?: Record<string, unknown>;
}

export interface PersistedWorkspace<Page extends string = string> {
  version: 1;
  activeIdentityKey: string | null;
  tabs: PersistedWorkspaceTab<Page>[];
}

let sequence = 0;

export function createWorkspaceTabId(prefix = "tab"): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

export function singletonIdentity(page: string): string {
  return `page:${page}`;
}

export function uniqueIdentity(page: string): string {
  return `new:${page}:${createWorkspaceTabId("workspace")}`;
}

export function entityIdentity(page: string, entityId: string, discriminator?: string): string {
  return `entity:${page}:${entityId}${discriminator ? `:${discriminator}` : ""}`;
}

export function reportIdentity(page: string, reportKind: string): string {
  return `report:${page}:${reportKind}`;
}

export function nextNumberedTitle<Page extends string>(tabs: WorkspaceTab<Page>[], baseTitle: string): string {
  const normalized = baseTitle.trim();
  const used = new Set(
    tabs
      .map((tab) => tab.title.trim())
      .filter((title) => title === normalized || title.startsWith(`${normalized} `)),
  );
  if (!used.has(normalized)) return normalized;
  let index = 2;
  while (used.has(`${normalized} ${index}`)) index += 1;
  return `${normalized} ${index}`;
}

export function activateOrAppend<Page extends string>(
  tabs: WorkspaceTab<Page>[],
  incoming: WorkspaceTab<Page>,
): { tabs: WorkspaceTab<Page>[]; activeId: string; reused: boolean } {
  if (incoming.kind !== "new") {
    const existing = tabs.find((tab) => tab.identityKey === incoming.identityKey);
    if (existing) {
      const now = Date.now();
      return {
        tabs: tabs.map((tab) => tab.id === existing.id ? { ...tab, lastActiveAt: now } : tab),
        activeId: existing.id,
        reused: true,
      };
    }
  }
  return { tabs: [...tabs, incoming], activeId: incoming.id, reused: false };
}

export function closeTabsByIds<Page extends string>(
  tabs: WorkspaceTab<Page>[],
  activeId: string,
  ids: Set<string>,
): { tabs: WorkspaceTab<Page>[]; activeId: string | null } {
  const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
  const remaining = tabs.filter((tab) => !ids.has(tab.id));
  if (remaining.length === 0) return { tabs: [], activeId: null };
  if (!ids.has(activeId)) return { tabs: remaining, activeId };

  const candidates = tabs
    .map((tab, index) => ({ tab, index }))
    .filter(({ tab }) => !ids.has(tab.id))
    .sort((a, b) => {
      const aDistance = Math.abs(a.index - activeIndex);
      const bDistance = Math.abs(b.index - activeIndex);
      if (aDistance !== bDistance) return aDistance - bDistance;
      return b.index - a.index;
    });
  return { tabs: remaining, activeId: candidates[0]?.tab.id ?? remaining[0].id };
}

export function serializableWorkspace<Page extends string>(
  tabs: WorkspaceTab<Page>[],
  activeId: string,
): PersistedWorkspace<Page> {
  const safeTabs = tabs.filter((tab): tab is WorkspaceTab<Page> & { kind: Exclude<WorkspaceTabKind, "new"> } =>
    tab.restoreSafe && tab.kind !== "new" && !tab.dirty,
  );
  const active = safeTabs.find((tab) => tab.id === activeId);
  return {
    version: 1,
    activeIdentityKey: active?.identityKey ?? safeTabs[0]?.identityKey ?? null,
    tabs: safeTabs.map(({ page, title, group, identityKey, kind, entityId, payload }) => ({
      page,
      title,
      group,
      identityKey,
      kind,
      entityId,
      payload,
    })),
  };
}

export function parsePersistedWorkspace<Page extends string>(value: string | null): PersistedWorkspace<Page> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PersistedWorkspace<Page>>;
    if (parsed.version !== 1 || !Array.isArray(parsed.tabs)) return null;
    const tabs = parsed.tabs.filter((tab): tab is PersistedWorkspaceTab<Page> =>
      Boolean(
        tab &&
        typeof tab === "object" &&
        typeof tab.page === "string" &&
        typeof tab.title === "string" &&
        typeof tab.group === "string" &&
        typeof tab.identityKey === "string" &&
        (tab.kind === "singleton" || tab.kind === "entity" || tab.kind === "report"),
      ),
    );
    return {
      version: 1,
      activeIdentityKey: typeof parsed.activeIdentityKey === "string" ? parsed.activeIdentityKey : null,
      tabs,
    };
  } catch {
    return null;
  }
}
