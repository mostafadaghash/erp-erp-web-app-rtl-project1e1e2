import type { Language } from "./catalog";

const ar = {
  openPages: "الصفحات المفتوحة",
  searchOpenPages: "ابحث في الصفحات المفتوحة",
  close: "إغلاق",
  closeOthers: "إغلاق التبويبات الأخرى",
  closeRight: "إغلاق التبويبات على اليمين",
  closeLeft: "إغلاق التبويبات على اليسار",
  closeAll: "إغلاق الكل",
  unsaved: "تعديلات غير محفوظة",
  activePage: "الصفحة الحالية",
  unsavedTitle: "تعديلات غير محفوظة",
  unsavedSingle: "لديك تعديلات غير محفوظة في هذه الصفحة. هل تريد إغلاقها بدون حفظ؟",
  unsavedMultiple: "بعض الصفحات المحددة تحتوي على تعديلات غير محفوظة. هل تريد إغلاقها بدون حفظ؟",
  stay: "البقاء في الصفحة",
  closeWithoutSaving: "إغلاق بدون حفظ",
  workspace: "مساحة العمل",
} as const;

export type WorkspaceMessageKey = keyof typeof ar;

const en: Record<WorkspaceMessageKey, string> = {
  openPages: "Open Pages",
  searchOpenPages: "Search open pages",
  close: "Close",
  closeOthers: "Close Other Tabs",
  closeRight: "Close Tabs to the Right",
  closeLeft: "Close Tabs to the Left",
  closeAll: "Close All",
  unsaved: "Unsaved changes",
  activePage: "Current Page",
  unsavedTitle: "Unsaved Changes",
  unsavedSingle: "This page has unsaved changes. Close it without saving?",
  unsavedMultiple: "Some selected pages have unsaved changes. Close them without saving?",
  stay: "Stay on Page",
  closeWithoutSaving: "Close Without Saving",
  workspace: "Workspace",
};

const catalogs: Record<Language, Record<WorkspaceMessageKey, string>> = { ar, en };

export function workspaceMessage(language: Language, key: WorkspaceMessageKey): string {
  return catalogs[language][key];
}
