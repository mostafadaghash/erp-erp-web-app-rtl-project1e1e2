import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Copy,
  History,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  Send,
  StickyNote,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  FOLLOW_UP_OUTCOME_DESCRIPTIONS,
  FOLLOW_UP_OUTCOME_LABELS,
  type FollowUpOutcome,
} from "../../shared/customerFollowUpOutcomeRules";
import { buildEgyptWhatsAppUrl, formatAppDate, formatAppNumber } from "../lib/utils";
import { CustomerTrackingLinkActions } from "./CustomerTrackingLinkActions";

const BUSINESS_TIME_ZONE = "Africa/Cairo";

type Scope = "active" | "today" | "overdue" | "later" | "completed" | "all";
type AttentionKind =
  | "all"
  | "repair_ready"
  | "order_overdue"
  | "repair_overdue"
  | "delivery_overdue"
  | "order_ready";
type ContactChannel = "call" | "whatsapp";
type DialogState =
  | { type: "contact"; channel: ContactChannel }
  | { type: "note" }
  | { type: "schedule" }
  | { type: "complete" }
  | { type: "reopen" }
  | null;

const COMPLETION_OUTCOMES: FollowUpOutcome[] = [
  "satisfied",
  "problem",
  "follow_up",
  "no_answer",
];

function cairoDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDaysIso(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(value));
}

function sourceLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    lead: "فرصة بيع",
    order: "أمر بيع",
    repair: "صيانة",
    delivery: "شحنة",
    delivered_operation: "عملية تم تسليمها",
    manual: "متابعة مستقلة",
  };
  return labels[sourceType] ?? sourceType;
}

function statusBadge(status: string): string {
  if (status === "overdue") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (status === "today") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "completed") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "follow_up_later") return "bg-sky-50 text-sky-700 ring-sky-200";
  return "bg-violet-50 text-violet-700 ring-violet-200";
}

function alertKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    repair_ready: "صيانة جاهزة للاستلام",
    order_overdue: "أمر بيع متأخر",
    repair_overdue: "صيانة متأخرة",
    delivery_overdue: "شحنة متأخرة",
    order_ready: "أمر بيع تم تجهيزه",
  };
  return labels[kind] ?? "تنبيه متابعة";
}

function timelineIcon(type: string, channel?: string) {
  if (channel === "call" || type === "call") return Phone;
  if (channel === "whatsapp" || type === "whatsapp") return MessageCircle;
  if (type === "note") return StickyNote;
  if (type === "reschedule") return CalendarClock;
  if (type === "complete") return CheckCircle2;
  if (type === "reopen") return RefreshCcw;
  if (type === "previous_follow_up") return History;
  return Clock3;
}

function outcomeCardStyle(outcome: FollowUpOutcome, selected: boolean): string {
  if (selected) {
    if (outcome === "satisfied") return "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100";
    if (outcome === "problem") return "border-rose-300 bg-rose-50 ring-2 ring-rose-100";
    if (outcome === "no_answer") return "border-amber-300 bg-amber-50 ring-2 ring-amber-100";
    return "border-sky-300 bg-sky-50 ring-2 ring-sky-100";
  }
  return "border-slate-200 bg-white hover:bg-slate-50";
}

export function CustomerFollowUpsPage() {
  const today = useMemo(() => cairoDate(), []);
  const tomorrow = useMemo(() => addDaysIso(today, 1), [today]);
  const me = useQuery(api.employees.me);
  const branchId = me?.branchId;
  const [scope, setScope] = useState<Scope>("active");
  const [mineOnly, setMineOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [attentionKind, setAttentionKind] = useState<AttentionKind>("all");
  const [selectedId, setSelectedId] = useState<Id<"customerFollowUps"> | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogText, setDialogText] = useState("");
  const [dialogDate, setDialogDate] = useState(today);
  const [completionOutcome, setCompletionOutcome] = useState<FollowUpOutcome>("satisfied");
  const [moreOpen, setMoreOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    customerName: "",
    phone: "",
    followUpType: "",
    followUpDate: today,
    notes: "",
  });
  const detailRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const dashboard = useQuery(
    api.customerFollowUpWorkspace.attentionDashboard,
    me ? { branchId, asOfDate: today } : "skip",
  );
  const followUps = useQuery(
    api.customerFollowUpWorkspace.list,
    me ? { branchId, scope, mineOnly, asOfDate: today } : "skip",
  );
  const details = useQuery(
    api.customerFollowUpWorkspace.getDetails,
    selectedId ? { id: selectedId, asOfDate: today } : "skip",
  );

  const createFromAttention = useMutation(api.customerFollowUpWorkspace.createFromAttention);
  const createManual = useMutation(api.customerFollowUpWorkspace.createManual);
  const recordChannelOpen = useMutation(api.customerFollowUpWorkspace.recordChannelOpen);
  const recordContact = useMutation(api.customerFollowUpWorkspace.recordContact);
  const addNote = useMutation(api.customerFollowUpWorkspace.addNote);
  const reschedule = useMutation(api.customerFollowUpWorkspace.reschedule);
  const applyOutcome = useMutation(api.customerFollowUpOutcomes.apply);
  const reopen = useMutation(api.customerFollowUpWorkspace.reopen);

  useEffect(() => {
    if (!selectedId && followUps?.[0]) setSelectedId(followUps[0]._id);
  }, [followUps, selectedId]);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreRef.current?.contains(event.target)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [moreOpen]);

  const visibleFollowUps = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return followUps ?? [];
    return (followUps ?? []).filter((row) =>
      [row.customerName, row.phone, row.sourceNumber, row.followUpType, row.result, row.assignedToName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [followUps, search]);

  const visibleAlerts = useMemo(
    () =>
      (dashboard?.alerts ?? []).filter(
        (alert) => attentionKind === "all" || alert.kind === attentionKind,
      ),
    [dashboard?.alerts, attentionKind],
  );

  const selectFollowUp = (id: Id<"customerFollowUps">) => {
    setSelectedId(id);
    setTimeout(() => {
      if (window.matchMedia("(max-width: 1023px)").matches) {
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 0);
  };

  const handleAttention = async (alert: NonNullable<typeof dashboard>["alerts"][number]) => {
    if (alert.followUpId) {
      selectFollowUp(alert.followUpId);
      return;
    }
    try {
      const id = await createFromAttention({
        branchId,
        sourceType: alert.sourceType,
        sourceId: alert.sourceId,
        reason: alert.reason,
        asOfDate: today,
      });
      toast.success("تم إنشاء المتابعة وإسنادها إليك");
      selectFollowUp(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء المتابعة");
    }
  };

  const startChannel = async (channel: ContactChannel) => {
    if (!selectedId || !details) return;
    const phone = details.customer.contactNumbers[0];
    if (!phone) {
      toast.error("لا يوجد رقم هاتف مسجل للعميل");
      return;
    }
    try {
      await recordChannelOpen({ id: selectedId, channel });
      if (channel === "whatsapp") {
        const message = `مرحبًا ${details.customer.name}، نتواصل مع حضرتك بخصوص ${details.followUp.followUpType}${details.source?.sourceNumber ? ` رقم ${details.source.sourceNumber}` : ""}.`;
        window.open(buildEgyptWhatsAppUrl(phone, message), "_blank", "noopener,noreferrer");
      } else {
        window.open(`tel:${phone}`, "_self");
      }
      setDialogText("");
      setDialog({ type: "contact", channel });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تسجيل محاولة التواصل");
    }
  };

  const openDialog = (next: Exclude<DialogState, null>) => {
    setDialogText("");
    if (next.type === "complete") {
      setCompletionOutcome("satisfied");
      setDialogDate(tomorrow);
    } else {
      setDialogDate(details?.followUp.followUpDate ?? today);
    }
    setDialog(next);
  };

  const submitDialog = async () => {
    if (!selectedId || !dialog) return;
    try {
      if (dialog.type === "contact") {
        if (!dialogText.trim()) return toast.error("اكتب نتيجة التواصل");
        await recordContact({ id: selectedId, channel: dialog.channel, result: dialogText.trim() });
        toast.success("تم تسجيل نتيجة التواصل");
      } else if (dialog.type === "note") {
        if (!dialogText.trim()) return toast.error("اكتب الملاحظة");
        await addNote({ id: selectedId, note: dialogText.trim() });
        toast.success("تمت إضافة الملاحظة");
      } else if (dialog.type === "schedule") {
        await reschedule({ id: selectedId, followUpDate: dialogDate, notes: dialogText.trim() || undefined });
        toast.success("تم تحديد موعد المتابعة");
      } else if (dialog.type === "complete") {
        if (completionOutcome === "problem" && !dialogText.trim()) {
          return toast.error("اكتب تفاصيل مشكلة العميل");
        }
        if ((completionOutcome === "follow_up" || completionOutcome === "no_answer") && !dialogDate) {
          return toast.error("حدد موعد المتابعة القادمة");
        }
        const result = await applyOutcome({
          id: selectedId,
          outcome: completionOutcome,
          details: dialogText.trim() || undefined,
          nextFollowUpDate:
            completionOutcome === "follow_up" || completionOutcome === "no_answer"
              ? dialogDate
              : undefined,
        });
        if (result.completed) {
          toast.success("تم إتمام المتابعة — العميل راضٍ");
        } else if (completionOutcome === "problem") {
          toast.success("تم تحويلها إلى متابعة مشكلة عميل");
        } else if (completionOutcome === "no_answer") {
          toast.success("تم تسجيل «لم يرد» وتحديد المحاولة القادمة");
        } else {
          toast.success("تم تحديد المتابعة القادمة");
        }
      } else if (dialog.type === "reopen") {
        await reopen({ id: selectedId, followUpDate: dialogDate, notes: dialogText.trim() || undefined });
        toast.success("تمت إعادة فتح المتابعة");
      }
      setDialog(null);
      setDialogText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الإجراء");
    }
  };

  const submitManual = async () => {
    if (!branchId) return toast.error("اختر فرع العمل أولًا");
    try {
      const id = await createManual({
        branchId,
        customerName: manualForm.customerName,
        phone: manualForm.phone,
        followUpType: manualForm.followUpType,
        followUpDate: manualForm.followUpDate,
        notes: manualForm.notes || undefined,
        creationRequestId: `manual:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`,
      });
      setManualOpen(false);
      setManualForm({ customerName: "", phone: "", followUpType: "", followUpDate: today, notes: "" });
      toast.success("تم إنشاء المتابعة اليدوية");
      selectFollowUp(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء المتابعة");
    }
  };

  const copyText = async (value: string, success: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(success);
      setMoreOpen(false);
    } catch {
      toast.error("تعذر النسخ");
    }
  };

  const cards = [
    {
      label: "متابعات اليوم",
      value: dashboard?.counts.followUpsToday ?? 0,
      helper: "مطلوب تنفيذها اليوم",
      icon: CalendarClock,
      onClick: () => setScope("today" as Scope),
    },
    {
      label: "متابعات متأخرة",
      value: dashboard?.counts.followUpsOverdue ?? 0,
      helper: "تجاوزت موعد المتابعة",
      icon: AlertTriangle,
      onClick: () => setScope("overdue" as Scope),
    },
    {
      label: "أوامر بيع متأخرة",
      value: dashboard?.counts.overdueOrders ?? 0,
      helper: "تجاوزت الموعد المتوقع",
      icon: Clock3,
      onClick: () => setAttentionKind("order_overdue"),
    },
    {
      label: "صيانة تم إصلاحها",
      value: dashboard?.counts.repairedWaitingCustomer ?? 0,
      helper: "تنتظر التواصل والاستلام",
      icon: Wrench,
      onClick: () => setAttentionKind("repair_ready"),
    },
    {
      label: "صيانة متأخرة",
      value: dashboard?.counts.overdueRepairs ?? 0,
      helper: "تجاوزت الموعد المتوقع",
      icon: AlertTriangle,
      onClick: () => setAttentionKind("repair_overdue"),
    },
    {
      label: "شحنات متأخرة",
      value: dashboard?.counts.overdueDeliveries ?? 0,
      helper: "تحتاج متابعة مع الشحن",
      icon: Send,
      onClick: () => setAttentionKind("delivery_overdue"),
    },
  ];

  return (
    <div className="space-y-5 p-4 lg:p-6" dir="rtl">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">متابعة العملاء</h2>
          <p className="mt-1 text-sm text-slate-500">
            مركز واحد للمتابعات والتنبيهات والتواصل مع العميل دون التنقل بين الصفحات.
          </p>
        </div>
        <button type="button" className="btn-primary flex items-center justify-center gap-2" onClick={() => setManualOpen(true)}>
          <Plus className="h-4 w-4" /> متابعة يدوية
        </button>
      </section>

      {dashboard?.requiresBranchSelection && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          اختر فرع العمل من الشريط العلوي لعرض تنبيهات ومتابعات الفرع.
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={card.onClick}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-2xl font-black text-slate-900">{formatAppNumber(card.value)}</span>
              </div>
              <p className="text-sm font-black text-slate-800">{card.label}</p>
              <p className="mt-1 text-[11px] text-slate-500">{card.helper}</p>
            </button>
          );
        })}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h3 className="font-black text-slate-900">يحتاج تدخل خدمة العملاء</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">حالات تشغيلية اكتشفها النظام وتحتاج تواصلًا أو متابعة.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAttentionKind("all")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold ${attentionKind === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              الكل
            </button>
            {attentionKind !== "all" && (
              <button type="button" onClick={() => setAttentionKind("all")} className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                مسح الفلتر
              </button>
            )}
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {dashboard === undefined && <div className="p-5 text-sm text-slate-400">جاري فحص العمليات التي تحتاج متابعة...</div>}
          {dashboard && visibleAlerts.length === 0 && (
            <div className="flex items-center gap-3 p-5 text-sm text-slate-500">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" /> لا توجد حالات تشغيلية معلقة ضمن هذا الفلتر.
            </div>
          )}
          {visibleAlerts.map((alert) => (
            <div key={alert.key} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">{alertKindLabel(alert.kind)}</span>
                  <span className="text-xs font-bold text-slate-500">{alert.sourceNumber}</span>
                  <span className="text-xs text-slate-400">{alert.sourceStatus}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <p className="font-black text-slate-900">{alert.customerName}</p>
                  {alert.phone && <span className="text-xs text-slate-500" dir="ltr">{alert.phone}</span>}
                  {alert.dueDate && <span className="text-xs font-bold text-rose-600">الموعد: {formatAppDate(alert.dueDate)}</span>}
                </div>
                <p className="mt-1 text-sm text-slate-600">{alert.reason}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleAttention(alert)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100"
              >
                {alert.followUpId ? "فتح المتابعة" : "إنشاء متابعة"}
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.4fr)]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-3 border-b border-slate-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-900">قائمة العمل</h3>
                <p className="mt-0.5 text-xs text-slate-500">{formatAppNumber(visibleFollowUps.length)} متابعة ظاهرة</p>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <input type="checkbox" checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)} />
                المسند إليّ
              </label>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="بحث بالعميل أو الهاتف أو رقم العملية"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {([
                ["active", "المفتوحة"],
                ["today", "اليوم"],
                ["overdue", "متأخر"],
                ["later", "لاحقًا"],
                ["completed", "مكتمل"],
                ["all", "الكل"],
              ] as Array<[Scope, string]>).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setScope(id)}
                  className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-black ${scope === id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[680px] divide-y divide-slate-100 overflow-y-auto">
            {followUps === undefined && <div className="p-5 text-sm text-slate-400">جاري تحميل المتابعات...</div>}
            {followUps && visibleFollowUps.length === 0 && <div className="p-5 text-sm text-slate-500">لا توجد متابعات ضمن الفلتر الحالي.</div>}
            {visibleFollowUps.map((row) => (
              <button
                key={row._id}
                type="button"
                onClick={() => selectFollowUp(row._id)}
                className={`w-full p-4 text-right transition hover:bg-slate-50 ${selectedId === row._id ? "bg-slate-50 ring-1 ring-inset ring-slate-200" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-900">{row.customerName}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{sourceLabel(row.sourceType)}{row.sourceNumber ? ` · ${row.sourceNumber}` : ""}</p>
                  </div>
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black ring-1 ring-inset ${statusBadge(row.commercialStatus)}`}>
                    {row.commercialStatusLabel}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-slate-700">{row.followUpType}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>الموعد: <b className="text-slate-700">{formatAppDate(row.followUpDate)}</b></span>
                  <span>{row.assignedToName}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div ref={detailRef} className="min-w-0 scroll-mt-4">
          {!selectedId && (
            <div className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <div>
                <UserRound className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 font-black text-slate-700">اختر متابعة لعرض كل ما يخص العميل</p>
              </div>
            </div>
          )}
          {selectedId && details === undefined && (
            <div className="grid min-h-[420px] place-items-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-400">جاري تحميل تفاصيل المتابعة...</div>
          )}
          {details && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-slate-900">{details.customer.name}</h3>
                      <span className={`rounded-lg px-2 py-1 text-[10px] font-black ring-1 ring-inset ${statusBadge(details.followUp.commercialStatus)}`}>
                        {details.followUp.commercialStatusLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{details.followUp.followUpType}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={details.followUp.status === "completed"} onClick={() => void startChannel("call")} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
                      <Phone className="h-4 w-4" /> اتصال
                    </button>
                    <button type="button" disabled={details.followUp.status === "completed"} onClick={() => void startChannel("whatsapp")} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
                      <MessageCircle className="h-4 w-4" /> واتساب
                    </button>
                    <CustomerTrackingLinkActions
                      followUpId={details.followUp._id}
                      customerName={details.customer.name}
                      phone={details.customer.contactNumbers[0]}
                      sourceNumber={details.source?.sourceNumber ?? details.followUp.sourceNumber}
                      sourceType={details.followUp.sourceType}
                    />
                    <button type="button" onClick={() => openDialog({ type: "note" })} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                      <StickyNote className="h-4 w-4" /> ملاحظة
                    </button>
                    <button type="button" disabled={details.followUp.status === "completed"} onClick={() => openDialog({ type: "schedule" })} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">
                      <CalendarClock className="h-4 w-4" /> موعد متابعة
                    </button>
                    <button type="button" disabled={details.followUp.status === "completed"} onClick={() => openDialog({ type: "complete" })} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-40">
                      <CheckCircle2 className="h-4 w-4" /> إتمام المتابعة
                    </button>
                    <div className="relative" ref={moreRef}>
                      <button type="button" onClick={() => setMoreOpen((value) => !value)} className="grid h-9 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600" aria-label="إجراءات إضافية">
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                      {moreOpen && (
                        <div className="absolute left-0 top-11 z-30 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                          {details.customer.contactNumbers[0] && (
                            <button type="button" onClick={() => void copyText(details.customer.contactNumbers[0], "تم نسخ رقم الهاتف")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs font-bold text-slate-700 hover:bg-slate-50">
                              <Copy className="h-3.5 w-3.5" /> نسخ رقم الهاتف
                            </button>
                          )}
                          {details.source?.sourceNumber && (
                            <button type="button" onClick={() => void copyText(details.source!.sourceNumber!, "تم نسخ رقم العملية")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs font-bold text-slate-700 hover:bg-slate-50">
                              <Copy className="h-3.5 w-3.5" /> نسخ رقم العملية
                            </button>
                          )}
                          {details.followUp.status === "completed" && (
                            <button type="button" onClick={() => { setMoreOpen(false); openDialog({ type: "reopen" }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs font-bold text-slate-700 hover:bg-slate-50">
                              <RefreshCcw className="h-3.5 w-3.5" /> إعادة فتح المتابعة
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-slate-500" />
                    <h4 className="font-black text-slate-900">بيانات العميل</h4>
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div><dt className="text-xs text-slate-400">الاسم</dt><dd className="mt-0.5 font-bold text-slate-800">{details.customer.name}</dd></div>
                    <div>
                      <dt className="text-xs text-slate-400">أرقام التواصل</dt>
                      <dd className="mt-1 flex flex-wrap gap-2">
                        {details.customer.contactNumbers.map((phone) => (
                          <span key={phone} dir="ltr" className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{phone}</span>
                        ))}
                      </dd>
                    </div>
                    {details.customer.email && <div><dt className="text-xs text-slate-400">البريد</dt><dd className="mt-0.5 text-slate-700">{details.customer.email}</dd></div>}
                    {details.customer.address && <div><dt className="text-xs text-slate-400">العنوان</dt><dd className="mt-0.5 text-slate-700">{details.customer.address}</dd></div>}
                  </dl>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-slate-500" />
                    <h4 className="font-black text-slate-900">العملية</h4>
                  </div>
                  {details.source ? (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div><dt className="text-xs text-slate-400">المصدر</dt><dd className="mt-0.5 font-bold text-slate-800">{sourceLabel(details.source.sourceType)}</dd></div>
                      <div><dt className="text-xs text-slate-400">رقم العملية</dt><dd className="mt-0.5 font-bold text-slate-800">{details.source.sourceNumber ?? "—"}</dd></div>
                      <div><dt className="text-xs text-slate-400">الحالة الحالية</dt><dd className="mt-0.5 font-bold text-slate-800">{details.source.status}</dd></div>
                      <div><dt className="text-xs text-slate-400">آخر تحديث مسجل</dt><dd className="mt-0.5 text-slate-700">{details.source.updatedDate ? formatAppDate(details.source.updatedDate) : formatDateTime(details.source.updatedAt)}</dd></div>
                      {details.source.expectedDate && <div><dt className="text-xs text-slate-400">الموعد المتوقع</dt><dd className="mt-0.5 text-slate-700">{formatAppDate(details.source.expectedDate)}</dd></div>}
                      {details.source.description && <div className="col-span-2"><dt className="text-xs text-slate-400">تفاصيل</dt><dd className="mt-0.5 text-slate-700">{details.source.description}</dd></div>}
                    </dl>
                  ) : (
                    <p className="text-sm text-slate-500">المتابعة مستقلة أو تعذر الوصول إلى المصدر الأصلي.</p>
                  )}
                </section>
              </div>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-slate-500" />
                    <h4 className="font-black text-slate-900">سجل التواصل والمتابعات</h4>
                  </div>
                  <span className="text-xs text-slate-400">الأحدث أولًا</span>
                </div>
                {details.timeline.length === 0 ? (
                  <p className="text-sm text-slate-500">لا يوجد تواصل مسجل بعد.</p>
                ) : (
                  <div className="relative space-y-0 before:absolute before:bottom-2 before:right-[15px] before:top-2 before:w-px before:bg-slate-200">
                    {details.timeline.map((event) => {
                      const Icon = timelineIcon(event.type, event.channel);
                      return (
                        <div key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                          <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-500">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-black text-slate-800">{event.title}</p>
                              <span className="text-[10px] text-slate-400">{formatDateTime(event.timestamp)}</span>
                            </div>
                            {event.content && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{event.content}</p>}
                            <p className="mt-1.5 text-[10px] font-bold text-slate-400">{event.performedBy}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </section>

      {manualOpen && (
        <ModalShell title="متابعة يدوية جديدة" onClose={() => setManualOpen(false)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم العميل"><input className="field-input" value={manualForm.customerName} onChange={(e) => setManualForm((value) => ({ ...value, customerName: e.target.value }))} /></Field>
            <Field label="الهاتف"><input dir="ltr" className="field-input text-left" value={manualForm.phone} onChange={(e) => setManualForm((value) => ({ ...value, phone: e.target.value }))} /></Field>
            <div className="sm:col-span-2"><Field label="نوع المتابعة"><input className="field-input" placeholder="مثال: متابعة عرض سعر أو تأكيد استلام" value={manualForm.followUpType} onChange={(e) => setManualForm((value) => ({ ...value, followUpType: e.target.value }))} /></Field></div>
            <Field label="تاريخ المتابعة"><input type="date" className="field-input" value={manualForm.followUpDate} onChange={(e) => setManualForm((value) => ({ ...value, followUpDate: e.target.value }))} /></Field>
            <div className="sm:col-span-2"><Field label="ملاحظات"><textarea rows={3} className="field-input resize-none" value={manualForm.notes} onChange={(e) => setManualForm((value) => ({ ...value, notes: e.target.value }))} /></Field></div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600" onClick={() => setManualOpen(false)}>إلغاء</button>
            <button type="button" className="btn-primary" onClick={() => void submitManual()}>إنشاء المتابعة</button>
          </div>
        </ModalShell>
      )}

      {dialog && (
        <ModalShell
          title={
            dialog.type === "contact"
              ? dialog.channel === "call" ? "تسجيل نتيجة الاتصال" : "تسجيل نتيجة واتساب"
              : dialog.type === "note"
                ? "إضافة ملاحظة"
                : dialog.type === "schedule"
                  ? "تحديد موعد متابعة"
                  : dialog.type === "reopen"
                    ? "إعادة فتح المتابعة"
                    : "نتيجة المتابعة"
          }
          onClose={() => setDialog(null)}
        >
          {dialog.type === "complete" ? (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-black text-slate-600">اختر نتيجة المتابعة</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {COMPLETION_OUTCOMES.map((outcome) => (
                    <button
                      key={outcome}
                      type="button"
                      onClick={() => {
                        setCompletionOutcome(outcome);
                        if (outcome === "follow_up" || outcome === "no_answer") {
                          setDialogDate((value) => value && value >= today ? value : tomorrow);
                        }
                      }}
                      className={`rounded-xl border p-3 text-right transition ${outcomeCardStyle(outcome, completionOutcome === outcome)}`}
                    >
                      <span className="block text-sm font-black text-slate-900">{FOLLOW_UP_OUTCOME_LABELS[outcome]}</span>
                      <span className="mt-1 block text-[11px] leading-5 text-slate-500">{FOLLOW_UP_OUTCOME_DESCRIPTIONS[outcome]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {(completionOutcome === "follow_up" || completionOutcome === "no_answer") && (
                <Field label={completionOutcome === "no_answer" ? "موعد محاولة التواصل القادمة" : "موعد المتابعة القادمة"}>
                  <input
                    type="date"
                    min={today}
                    className="field-input"
                    value={dialogDate}
                    onChange={(event) => setDialogDate(event.target.value)}
                  />
                </Field>
              )}

              <Field label={completionOutcome === "problem" ? "تفاصيل المشكلة *" : "ملاحظة اختيارية"}>
                <textarea
                  autoFocus={completionOutcome === "problem"}
                  rows={3}
                  className="field-input resize-none"
                  value={dialogText}
                  onChange={(event) => setDialogText(event.target.value)}
                  placeholder={
                    completionOutcome === "problem"
                      ? "اكتب المشكلة التي ذكرها العميل وما المطلوب متابعته"
                      : completionOutcome === "no_answer"
                        ? "مثال: الهاتف مغلق أو لا توجد إجابة"
                        : undefined
                  }
                />
              </Field>

              <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {completionOutcome === "satisfied" && "سيتم إغلاق هذه المتابعة."}
                {completionOutcome === "problem" && "ستظل مفتوحة ويصبح نوعها «مشكلة عميل» وتظهر ضمن عمل اليوم."}
                {completionOutcome === "follow_up" && "ستظل مفتوحة وتنتقل تلقائيًا إلى الموعد الذي اخترته."}
                {completionOutcome === "no_answer" && "ستُسجل محاولة التواصل وتظل المتابعة مفتوحة حتى موعد المحاولة القادمة."}
              </div>
            </div>
          ) : (
            <>
              {(dialog.type === "schedule" || dialog.type === "reopen") && (
                <Field label="تاريخ المتابعة">
                  <input type="date" className="field-input" value={dialogDate} onChange={(event) => setDialogDate(event.target.value)} />
                </Field>
              )}
              <div className={(dialog.type === "schedule" || dialog.type === "reopen") ? "mt-3" : ""}>
                <Field label={dialog.type === "note" ? "الملاحظة" : dialog.type === "schedule" || dialog.type === "reopen" ? "ملاحظة اختيارية" : "النتيجة"}>
                  <textarea
                    autoFocus
                    rows={4}
                    className="field-input resize-none"
                    value={dialogText}
                    onChange={(event) => setDialogText(event.target.value)}
                    placeholder={dialog.type === "contact" ? "مثال: تم التواصل وسيحضر العميل غدًا" : undefined}
                  />
                </Field>
              </div>
            </>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600" onClick={() => setDialog(null)}>إلغاء</button>
            <button type="button" className="btn-primary" onClick={() => void submitDialog()}>{dialog.type === "complete" ? "حفظ النتيجة" : "حفظ"}</button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-black text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="إغلاق">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-slate-600">{label}</span>
      {children}
    </label>
  );
}
