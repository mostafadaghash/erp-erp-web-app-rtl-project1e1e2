import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, PanelsTopLeft, Search, X } from "lucide-react";
import type { WorkspaceTab } from "./workspaceModel";
import "./workspace.css";

export interface WorkspaceLabels {
  openPages: string;
  searchOpenPages: string;
  close: string;
  closeOthers: string;
  closeRight: string;
  closeLeft: string;
  closeAll: string;
  unsaved: string;
  activePage: string;
}

interface WorkspaceTabsProps<Page extends string> {
  tabs: WorkspaceTab<Page>[];
  activeId: string;
  labels: WorkspaceLabels;
  onActivate: (tabId: string) => void;
  onRequestClose: (tabIds: string[]) => void;
}

export function WorkspaceTabs<Page extends string>({
  tabs,
  activeId,
  labels,
  onActivate,
  onRequestClose,
}: WorkspaceTabsProps<Page>) {
  const stripRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [contextTabId, setContextTabId] = useState<string | null>(null);

  useEffect(() => {
    tabRefs.current.get(activeId)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [activeId, tabs.length]);

  useEffect(() => {
    if (!listOpen && !contextTabId) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("[data-workspace-menu]")) return;
      setListOpen(false);
      setContextTabId(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [listOpen, contextTabId]);

  const filteredTabs = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    if (!value) return tabs;
    return tabs.filter((tab) => `${tab.title} ${tab.group}`.toLocaleLowerCase().includes(value));
  }, [query, tabs]);

  const requestRelativeClose = (tabId: string, mode: "self" | "others" | "right" | "left" | "all") => {
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return;
    const rtl = document.documentElement.dir === "rtl";
    let targets: WorkspaceTab<Page>[] = [];
    if (mode === "self") targets = [tabs[index]];
    if (mode === "others") targets = tabs.filter((tab) => tab.id !== tabId);
    if (mode === "right") targets = rtl ? tabs.slice(0, index) : tabs.slice(index + 1);
    if (mode === "left") targets = rtl ? tabs.slice(index + 1) : tabs.slice(0, index);
    if (mode === "all") targets = tabs;
    if (targets.length > 0) onRequestClose(targets.map((tab) => tab.id));
    setContextTabId(null);
    setListOpen(false);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!stripRef.current || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    stripRef.current.scrollLeft += event.deltaY;
  };

  const tabButton = (tab: WorkspaceTab<Page>) => {
    const active = tab.id === activeId;
    return (
      <div
        key={tab.id}
        className={`group relative flex h-10 min-w-[9rem] max-w-[15rem] shrink-0 items-center rounded-t-xl border border-b-0 transition ${
          active
            ? "border-slate-300 bg-white text-slate-950 shadow-[0_-1px_8px_rgba(15,23,42,0.04)]"
            : "border-transparent bg-slate-100/80 text-slate-600 hover:bg-slate-200/70"
        }`}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextTabId(tab.id);
          setListOpen(false);
        }}
      >
        <button
          ref={(node) => {
            if (node) tabRefs.current.set(tab.id, node);
            else tabRefs.current.delete(tab.id);
          }}
          type="button"
          className="min-w-0 flex-1 truncate px-3 text-start text-xs font-extrabold"
          title={tab.title}
          aria-current={active ? "page" : undefined}
          onClick={() => onActivate(tab.id)}
        >
          {tab.title}
          {tab.dirty && <span className="ms-1.5 text-amber-500" aria-label={labels.unsaved}>●</span>}
        </button>
        <button
          type="button"
          className="me-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-200 hover:text-slate-800"
          aria-label={`${labels.close}: ${tab.title}`}
          title={labels.close}
          onClick={(event) => {
            event.stopPropagation();
            onRequestClose([tab.id]);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  const contextTab = tabs.find((tab) => tab.id === contextTabId);

  return (
    <div className="relative shrink-0 border-b border-slate-200 bg-slate-100/70" data-testid="workspace-tabs">
      <div className="hidden min-w-0 items-end gap-1 px-3 pt-1 lg:flex">
        <div
          ref={stripRef}
          className="workspace-tabs-scroll flex min-w-0 flex-1 items-end gap-1 overflow-x-auto overscroll-contain [scrollbar-width:thin]"
          onWheel={handleWheel}
        >
          {tabs.map(tabButton)}
        </div>
        <div className="relative shrink-0 pb-1" data-workspace-menu>
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm hover:text-slate-900"
            onClick={() => {
              setListOpen((value) => !value);
              setContextTabId(null);
            }}
            aria-expanded={listOpen}
          >
            <PanelsTopLeft className="h-4 w-4" />
            <span>{labels.openPages}</span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px]">{tabs.length}</span>
          </button>
          {listOpen && (
            <WorkspaceList
              tabs={filteredTabs}
              activeId={activeId}
              query={query}
              labels={labels}
              onQuery={setQuery}
              onActivate={(id) => { onActivate(id); setListOpen(false); }}
              onClose={(id) => onRequestClose([id])}
              onCloseAll={() => requestRelativeClose(activeId, "all")}
            />
          )}
        </div>
      </div>

      <div className="flex items-center px-3 py-2 lg:hidden" data-workspace-menu>
        <button
          type="button"
          data-testid="workspace-mobile-open-pages"
          className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm"
          onClick={() => setListOpen(true)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <PanelsTopLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">{tabs.find((tab) => tab.id === activeId)?.title ?? labels.activePage}</span>
          </span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{labels.openPages} ({tabs.length})</span>
        </button>
      </div>

      {listOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setListOpen(false)}>
          <div
            className="absolute inset-x-3 bottom-3 max-h-[75vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            data-workspace-menu
            onClick={(event) => event.stopPropagation()}
          >
            <WorkspaceList
              tabs={filteredTabs}
              activeId={activeId}
              query={query}
              labels={labels}
              mobile
              onQuery={setQuery}
              onActivate={(id) => { onActivate(id); setListOpen(false); }}
              onClose={(id) => onRequestClose([id])}
              onCloseAll={() => requestRelativeClose(activeId, "all")}
            />
          </div>
        </div>
      )}

      {contextTab && (
        <div
          className="absolute end-3 top-[calc(100%+4px)] z-[75] w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl"
          data-workspace-menu
          data-testid="workspace-context-menu"
        >
          <ContextAction label={labels.close} onClick={() => requestRelativeClose(contextTab.id, "self")} />
          <ContextAction label={labels.closeOthers} onClick={() => requestRelativeClose(contextTab.id, "others")} />
          <ContextAction label={labels.closeRight} onClick={() => requestRelativeClose(contextTab.id, "right")} />
          <ContextAction label={labels.closeLeft} onClick={() => requestRelativeClose(contextTab.id, "left")} />
          <div className="my-1 border-t border-slate-100" />
          <ContextAction label={labels.closeAll} onClick={() => requestRelativeClose(contextTab.id, "all")} />
        </div>
      )}
    </div>
  );
}

function WorkspaceList<Page extends string>({
  tabs,
  activeId,
  query,
  labels,
  mobile = false,
  onQuery,
  onActivate,
  onClose,
  onCloseAll,
}: {
  tabs: WorkspaceTab<Page>[];
  activeId: string;
  query: string;
  labels: WorkspaceLabels;
  mobile?: boolean;
  onQuery: (value: string) => void;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onCloseAll: () => void;
}) {
  return (
    <div className={mobile ? "flex max-h-[75vh] flex-col" : "absolute end-0 top-[calc(100%+8px)] z-[70] flex max-h-[28rem] w-80 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"}>
      <div className="border-b border-slate-100 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={labels.searchOpenPages}
            className="w-full rounded-xl border border-slate-200 py-2 pe-3 ps-9 text-sm outline-none focus:border-slate-400"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tabs.map((tab) => (
          <div key={tab.id} className={`mb-1 flex items-center gap-2 rounded-xl ${tab.id === activeId ? "bg-slate-100" : "hover:bg-slate-50"}`}>
            <button type="button" className="min-w-0 flex-1 px-3 py-2.5 text-start" onClick={() => onActivate(tab.id)}>
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-bold text-slate-800">{tab.title}</span>
                {tab.dirty && <span className="text-amber-500" aria-label={labels.unsaved}>●</span>}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-slate-400">{tab.group}</div>
            </button>
            <button type="button" className="me-2 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-800" aria-label={`${labels.close}: ${tab.title}`} onClick={() => onClose(tab.id)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 p-2">
        <button type="button" className="w-full rounded-xl px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100" onClick={onCloseAll}>{labels.closeAll}</button>
      </div>
    </div>
  );
}

function ContextAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-xs font-bold text-slate-700 hover:bg-slate-100" onClick={onClick}>
      <MoreHorizontal className="h-3.5 w-3.5 text-slate-400" />
      {label}
    </button>
  );
}
