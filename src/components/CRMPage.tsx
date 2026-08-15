import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { usePermission } from "../lib/access";
import { buildEgyptWhatsAppUrl } from "../lib/utils";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";
import {
  Target, Plus, X, Search, Phone, Mail, MessageCircle,
  TrendingUp, Users, CheckCircle, XCircle,
  Pencil, Trash2, Star, PhoneCall, MessageSquare,
  MapPin, Calendar, ArrowLeftRight, Filter, Zap, Eye
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCES = [
  { value: "instagram",  label: "إنستغرام",    color: "bg-pink-100 text-pink-700",    emoji: "📸" },
  { value: "whatsapp",   label: "واتساب",       color: "bg-green-100 text-green-700",  emoji: "💬" },
  { value: "walk_in",    label: "زيارة مباشرة", color: "bg-blue-100 text-blue-700",    emoji: "🚶" },
  { value: "referral",   label: "توصية",        color: "bg-purple-100 text-purple-700",emoji: "🤝" },
  { value: "website",    label: "الموقع",       color: "bg-indigo-100 text-indigo-700",emoji: "🌐" },
  { value: "phone",      label: "اتصال هاتفي",  color: "bg-amber-100 text-amber-700",  emoji: "📞" },
  { value: "other",      label: "أخرى",         color: "bg-slate-100 text-slate-600",  emoji: "📌" },
];

const STATUSES = [
  { value: "new",         label: "جديد",        color: "bg-blue-100 text-blue-700",     dot: "bg-blue-500",    icon: Zap },
  { value: "contacted",   label: "تم التواصل",  color: "bg-amber-100 text-amber-700",   dot: "bg-amber-500",   icon: PhoneCall },
  { value: "interested",  label: "مهتم",        color: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500",  icon: Star },
  { value: "negotiating", label: "في التفاوض",  color: "bg-purple-100 text-purple-700", dot: "bg-purple-500",  icon: ArrowLeftRight },
  { value: "won",         label: "تم البيع ✓",  color: "bg-emerald-100 text-emerald-700",dot:"bg-emerald-500", icon: CheckCircle },
  { value: "lost",        label: "خسرنا",       color: "bg-red-100 text-red-700",       dot: "bg-red-500",     icon: XCircle },
];

const ACTIVITY_TYPES = [
  { value: "call",     label: "اتصال هاتفي",  icon: PhoneCall,     color: "text-blue-600 bg-blue-50" },
  { value: "whatsapp", label: "واتساب",        icon: MessageCircle, color: "text-green-600 bg-green-50" },
  { value: "visit",    label: "زيارة",         icon: MapPin,        color: "text-purple-600 bg-purple-50" },
  { value: "email",    label: "بريد إلكتروني", icon: Mail,          color: "text-indigo-600 bg-indigo-50" },
  { value: "note",     label: "ملاحظة",        icon: MessageSquare, color: "text-slate-600 bg-slate-50" },
];

const getSource = (val: string) => SOURCES.find(s => s.value === val) ?? SOURCES[SOURCES.length - 1];
const getStatus = (val: string) => STATUSES.find(s => s.value === val) ?? STATUSES[0];
const getActivityType = (val: string) => ACTIVITY_TYPES.find(t => t.value === val) ?? ACTIVITY_TYPES[4];

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadForm {
  name: string; phone: string; email: string;
  source: string; status: string; interest: string;
  budget: string; assignedTo: string; notes: string;
  nextFollowUpDate: string;
}

const emptyLeadForm = (): LeadForm => ({
  name: "", phone: "", email: "", source: "instagram", status: "new",
  interest: "", budget: "", assignedTo: "", notes: "", nextFollowUpDate: "",
});

// ─── Main Component ───────────────────────────────────────────────────────────

export function CRMPage() {
  const canCreate = usePermission("create_leads");
  const canEdit = usePermission("edit_leads");
  const canDelete = usePermission("delete_leads");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<Id<"leads"> | null>(null);
  const [form, setForm] = useState<LeadForm>(emptyLeadForm());
  const [selectedLead, setSelectedLead] = useState<Id<"leads"> | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const [activityForm, setActivityForm] = useState({ type: "call", notes: "", outcome: "", nextAction: "" });

  const leads = useQuery(api.leads.list, {});
  const stats = useQuery(api.leads.stats);
  const leadDetail = useQuery(
    api.leads.getWithActivities,
    selectedLead ? { id: selectedLead } : "skip"
  );

  const createLead = useMutation(api.leads.create);
  const updateLead = useMutation(api.leads.update);
  const updateStatus = useMutation(api.leads.updateStatus);
  const removeLead = useMutation(api.leads.remove);
  const convertToCustomer = useMutation(api.leads.convertToCustomer);
  const addActivity = useMutation(api.leads.addActivity);
  const deleteActivity = useMutation(api.leads.deleteActivity);

  const filtered = (leads ?? []).filter(l => {
    const matchSearch = l.name.includes(search) || l.phone.includes(search) || (l.interest ?? "").includes(search);
    const matchSource = filterSource === "all" || l.source === filterSource;
    return matchSearch && matchSource;
  });

  const byStatus = STATUSES.reduce((acc, s) => {
    acc[s.value] = filtered.filter(l => l.status === s.value);
    return acc;
  }, {} as Record<string, typeof filtered>);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openCreate = () => { setForm(emptyLeadForm()); setEditId(null); setShowForm(true); };

  const openEdit = (lead: NonNullable<typeof leads>[number]) => {
    setForm({
      name: lead.name, phone: lead.phone, email: lead.email ?? "",
      source: lead.source, status: lead.status, interest: lead.interest ?? "",
      budget: lead.budget?.toString() ?? "", assignedTo: lead.assignedTo ?? "",
      notes: lead.notes ?? "", nextFollowUpDate: lead.nextFollowUpDate ?? "",
    });
    setEditId(lead._id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("أدخل اسم العميل"); return; }
    if (!form.phone.trim()) { toast.error("أدخل رقم الهاتف"); return; }
    try {
      const payload = {
        name: form.name, phone: form.phone,
        email: form.email || undefined, source: form.source, status: form.status,
        interest: form.interest || undefined,
        budget: form.budget ? parseFloat(form.budget) : undefined,
        assignedTo: form.assignedTo || undefined,
        notes: form.notes || undefined,
        nextFollowUpDate: form.nextFollowUpDate || undefined,
      };
      if (editId) {
        await updateLead({ id: editId, ...payload });
        toast.success("تم تحديث بيانات العميل");
      } else {
        await createLead(payload);
        toast.success("تم إضافة العميل المحتمل");
      }
      setShowForm(false);
    } catch (err) { toast.error(err instanceof Error ? err.message : "حدث خطأ"); }
  };

  const handleStatusChange = async (id: Id<"leads">, status: string) => {
    try {
      await updateStatus({ id, status });
      toast.success(`تم تغيير الحالة إلى: ${getStatus(status).label}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "حدث خطأ"); }
  };

  const handleDelete = async (id: Id<"leads">) => {
    if (!confirm("هل أنت متأكد من حذف هذا العميل المحتمل؟")) return;
    try { await removeLead({ id }); toast.success("تم الحذف"); if (selectedLead === id) setSelectedLead(null); }
    catch (err) { toast.error(err instanceof Error ? err.message : "حدث خطأ"); }
  };

  const handleConvert = async (id: Id<"leads">) => {
    if (!confirm("تحويل هذا العميل المحتمل إلى عميل فعلي؟")) return;
    try {
      await convertToCustomer({ id });
      toast.success("✅ تم التحويل إلى عميل فعلي بنجاح!");
    } catch (err) { toast.error(err instanceof Error ? err.message : "حدث خطأ"); }
  };

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !activityForm.notes.trim()) { toast.error("أدخل ملاحظات التواصل"); return; }
    try {
      await addActivity({
        leadId: selectedLead,
        type: activityForm.type,
        notes: activityForm.notes,
        outcome: activityForm.outcome || undefined,
        nextAction: activityForm.nextAction || undefined,
      });
      toast.success("تم تسجيل التواصل");
      setActivityForm({ type: "call", notes: "", outcome: "", nextAction: "" });
      setShowActivity(false);
    } catch (err) { toast.error(err instanceof Error ? err.message : "حدث خطأ"); }
  };

  const buildWhatsApp = (phone: string, name: string) => {
    return buildEgyptWhatsAppUrl(phone, `مرحباً ${name}، شكراً لاهتمامك. هل يمكنني مساعدتك؟`);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Target className="w-6 h-6 text-indigo-600" />
            إدارة علاقات العملاء
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">تتبع العملاء من أول تواصل حتى إتمام البيع</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button onClick={() => setView("kanban")} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${view === "kanban" ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}>كانبان</button>
            <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${view === "list" ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}>قائمة</button>
          </div>
          {canCreate && <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> عميل جديد
          </button>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "إجمالي",       value: stats?.total ?? 0,                    color: "text-slate-700",   bg: "bg-slate-50",    border: "border-slate-200" },
          { label: "جدد",          value: stats?.new ?? 0,                      color: "text-blue-700",    bg: "bg-blue-50",     border: "border-blue-100" },
          { label: "مهتمون",       value: stats?.interested ?? 0,               color: "text-indigo-700",  bg: "bg-indigo-50",   border: "border-indigo-100" },
          { label: "تفاوض",        value: stats?.negotiating ?? 0,              color: "text-purple-700",  bg: "bg-purple-50",   border: "border-purple-100" },
          { label: "تم البيع",     value: stats?.won ?? 0,                      color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-100" },
          { label: "معدل التحويل", value: `${stats?.conversionRate ?? 0}%`,     color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-100" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-4 text-center`}>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="form-input pr-9" placeholder="بحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterSource("all")} className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${filterSource === "all" ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-300"}`}>الكل</button>
          {SOURCES.map(s => (
            <button key={s.value} onClick={() => setFilterSource(s.value)} className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${filterSource === s.value ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-300"}`}>
              {s.emoji} {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KANBAN VIEW ── */}
      {view === "kanban" && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {STATUSES.map(status => {
              const cards = byStatus[status.value] ?? [];
              const StatusIcon = status.icon;
              return (
                <div key={status.value} className="w-72 flex-shrink-0">
                  <div className={`flex items-center justify-between px-4 py-3 rounded-xl mb-3 ${status.color}`}>
                    <div className="flex items-center gap-2">
                      <StatusIcon className="w-4 h-4" />
                      <span className="font-bold text-sm">{status.label}</span>
                    </div>
                    <span className="bg-white/60 text-xs font-bold px-2 py-0.5 rounded-full">{cards.length}</span>
                  </div>
                  <div className="space-y-3">
                    {cards.length === 0 && (
                      <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                        <p className="text-slate-400 text-xs">لا يوجد عملاء</p>
                      </div>
                    )}
                    {cards.map(lead => {
                      const src = getSource(lead.source);
                      return (
                        <div key={lead._id} className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-4 cursor-pointer group" onClick={() => setSelectedLead(lead._id)}>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="font-bold text-slate-800 text-sm">{lead.name}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${src.color}`}>{src.emoji} {src.label}</span>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {canEdit && <button onClick={e => { e.stopPropagation(); openEdit(lead); }} className="p-1 hover:bg-slate-100 rounded-lg"><Pencil className="w-3 h-3 text-slate-400" /></button>}
                              {canDelete && <button onClick={e => { e.stopPropagation(); handleDelete(lead._id); }} className="p-1 hover:bg-red-50 rounded-lg"><Trash2 className="w-3 h-3 text-red-400" /></button>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
                            <Phone className="w-3 h-3" /><span>{lead.phone}</span>
                          </div>
                          {lead.interest && <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2 py-1 mb-2 truncate">🛍️ {lead.interest}</p>}
                          {lead.budget && <p className="text-xs text-emerald-600 font-semibold mb-2">💰 {lead.budget.toLocaleString("ar-EG")} ج.م</p>}
                          {lead.nextFollowUpDate && (
                            <div className="flex items-center gap-1 text-xs text-amber-600 mb-2">
                              <Calendar className="w-3 h-3" /><span>متابعة: {lead.nextFollowUpDate}</span>
                            </div>
                          )}
                          <div className="flex gap-1.5 mt-3 pt-3 border-t border-slate-100">
                            <a href={buildWhatsApp(lead.phone, lead.name)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-50 text-green-600 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors">
                              <MessageCircle className="w-3 h-3" /> واتساب
                            </a>
                            <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">
                              <Phone className="w-3 h-3" /> اتصال
                            </a>
                          </div>
                          {canEdit && <select
                            value={lead.status}
                            onChange={e => { e.stopPropagation(); handleStatusChange(lead._id, e.target.value); }}
                            onClick={e => e.stopPropagation()}
                            className="w-full mt-2 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:border-indigo-400"
                          >
                            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === "list" && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Target className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-slate-500 font-medium">لا يوجد عملاء محتملون</p>
              {canCreate && <button onClick={openCreate} className="btn-primary mt-4 inline-flex items-center gap-2"><Plus className="w-4 h-4" /> إضافة عميل</button>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>العميل</th><th>المصدر</th><th>الاهتمام</th><th>الميزانية</th><th>الحالة</th><th>المتابعة</th><th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(lead => {
                    const src = getSource(lead.source);
                    const sts = getStatus(lead.status);
                    return (
                      <tr key={lead._id} className="cursor-pointer" onClick={() => setSelectedLead(lead._id)}>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-white text-sm font-bold">{lead.name.charAt(0)}</span>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800">{lead.name}</p>
                              <p className="text-xs text-slate-400">{lead.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td><span className={`px-2 py-1 rounded-lg text-xs font-medium ${src.color}`}>{src.emoji} {src.label}</span></td>
                        <td><span className="text-sm text-slate-600 truncate max-w-32 block">{lead.interest ?? "—"}</span></td>
                        <td><span className="text-sm font-semibold text-emerald-600">{lead.budget ? `${lead.budget.toLocaleString("ar-EG")} ج.م` : "—"}</span></td>
                        <td><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${sts.color}`}>{sts.label}</span></td>
                        <td><span className={`text-xs ${lead.nextFollowUpDate ? "text-amber-600 font-medium" : "text-slate-400"}`}>{lead.nextFollowUpDate ?? "—"}</span></td>
                        <td>
                          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setSelectedLead(lead._id)} className="p-1.5 bg-slate-50 text-slate-500 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                            {canEdit && <button onClick={() => openEdit(lead)} className="p-1.5 bg-slate-50 text-slate-500 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>}
                            <a href={buildWhatsApp(lead.phone, lead.name)} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"><MessageCircle className="w-3.5 h-3.5" /></a>
                            {canDelete && <button onClick={() => handleDelete(lead._id)} className="p-1.5 bg-slate-50 text-slate-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── LEAD DETAIL DRAWER ── */}
      {selectedLead && leadDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-start" onClick={() => setSelectedLead(null)}>
          <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">{leadDetail.name.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-bold text-slate-800">{leadDetail.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatus(leadDetail.status).color}`}>{getStatus(leadDetail.status).label}</span>
                </div>
              </div>
              <button onClick={() => setSelectedLead(null)} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-5">
              {/* Contact Info */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase">معلومات التواصل</p>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <a href={`tel:${leadDetail.phone}`} className="text-indigo-600 font-medium hover:underline">{leadDetail.phone}</a>
                </div>
                {leadDetail.email && <div className="flex items-center gap-2 text-sm"><Mail className="w-4 h-4 text-slate-400" /><span className="text-slate-600">{leadDetail.email}</span></div>}
                <div className="flex items-center gap-2 text-sm">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getSource(leadDetail.source).color}`}>{getSource(leadDetail.source).emoji} {getSource(leadDetail.source).label}</span>
                </div>
                {leadDetail.interest && <div className="flex items-center gap-2 text-sm"><Star className="w-4 h-4 text-slate-400" /><span className="text-slate-600">{leadDetail.interest}</span></div>}
                {leadDetail.budget && <div className="flex items-center gap-2 text-sm"><TrendingUp className="w-4 h-4 text-slate-400" /><span className="text-emerald-600 font-semibold">{leadDetail.budget.toLocaleString("ar-EG")} ج.م</span></div>}
                {leadDetail.assignedTo && <div className="flex items-center gap-2 text-sm"><Users className="w-4 h-4 text-slate-400" /><span className="text-slate-600">مسؤول: {leadDetail.assignedTo}</span></div>}
                {leadDetail.nextFollowUpDate && <div className="flex items-center gap-2 text-sm"><Calendar className="w-4 h-4 text-amber-500" /><span className="text-amber-600 font-medium">متابعة: {leadDetail.nextFollowUpDate}</span></div>}
                {leadDetail.notes && <p className="text-xs text-slate-500 bg-white rounded-xl p-3 border border-slate-200">{leadDetail.notes}</p>}
              </div>

              {/* Status Change */}
              {canEdit && <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">تغيير الحالة</p>
                <div className="grid grid-cols-3 gap-2">
                  {STATUSES.map(s => {
                    const SIcon = s.icon;
                    return (
                      <button key={s.value} onClick={() => handleStatusChange(leadDetail._id, s.value)}
                        className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 text-xs font-medium transition-all ${leadDetail.status === s.value ? `${s.color} border-current` : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                        <SIcon className="w-4 h-4" />{s.label}
                      </button>
                    );
                  })}
                </div>
              </div>}

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3">
                <a href={buildWhatsApp(leadDetail.phone, leadDetail.name)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 bg-green-500 text-white rounded-xl font-medium text-sm hover:bg-green-600 transition-colors">
                  <MessageCircle className="w-4 h-4" /> واتساب
                </a>
                {canEdit && !leadDetail.convertedToCustomerId && leadDetail.status !== "lost" ? (
                  <button onClick={() => handleConvert(leadDetail._id)}
                    className="flex items-center justify-center gap-2 py-3 bg-emerald-500 text-white rounded-xl font-medium text-sm hover:bg-emerald-600 transition-colors">
                    <CheckCircle className="w-4 h-4" /> تحويل لعميل
                  </button>
                ) : leadDetail.convertedToCustomerId ? (
                  <div className="flex items-center justify-center gap-2 py-3 bg-emerald-50 text-emerald-700 rounded-xl font-medium text-sm border border-emerald-200">
                    <CheckCircle className="w-4 h-4" /> تم التحويل ✓
                  </div>
                ) : null}
                {canEdit && <button onClick={() => { openEdit(leadDetail); setSelectedLead(null); }}
                  className="flex items-center justify-center gap-2 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-medium text-sm hover:bg-indigo-100 transition-colors col-span-1">
                  <Pencil className="w-4 h-4" /> تعديل
                </button>}
                {canDelete && <button onClick={() => handleDelete(leadDetail._id)}
                  className="flex items-center justify-center gap-2 py-3 bg-red-50 text-red-500 rounded-xl font-medium text-sm hover:bg-red-100 transition-colors col-span-1">
                  <Trash2 className="w-4 h-4" /> حذف
                </button>}
              </div>

              {/* Activity Log */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-slate-500 uppercase">سجل التواصل</p>
                  {canEdit && <button onClick={() => setShowActivity(!showActivity)} className="flex items-center gap-1 text-xs text-indigo-600 font-medium hover:text-indigo-700">
                    <Plus className="w-3.5 h-3.5" /> تسجيل تواصل
                  </button>}
                </div>

                {showActivity && (
                  <form onSubmit={handleAddActivity} className="bg-indigo-50 rounded-xl p-4 mb-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {ACTIVITY_TYPES.map(t => {
                        const TIcon = t.icon;
                        return (
                          <button key={t.value} type="button" onClick={() => setActivityForm({ ...activityForm, type: t.value })}
                            className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium border-2 transition-all ${activityForm.type === t.value ? `${t.color} border-current` : "border-slate-200 bg-white text-slate-500"}`}>
                            <TIcon className="w-3.5 h-3.5" />{t.label}
                          </button>
                        );
                      })}
                    </div>
                    <textarea className="form-input resize-none" rows={2} placeholder="ملاحظات التواصل..." value={activityForm.notes} onChange={e => setActivityForm({ ...activityForm, notes: e.target.value })} />
                    <input className="form-input" placeholder="نتيجة التواصل (اختياري)" value={activityForm.outcome} onChange={e => setActivityForm({ ...activityForm, outcome: e.target.value })} />
                    <input className="form-input" placeholder="الإجراء التالي (اختياري)" value={activityForm.nextAction} onChange={e => setActivityForm({ ...activityForm, nextAction: e.target.value })} />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowActivity(false)} className="btn-secondary flex-1 text-xs py-2">إلغاء</button>
                      <button type="submit" className="btn-primary flex-1 text-xs py-2">حفظ</button>
                    </div>
                  </form>
                )}

                <div className="space-y-3">
                  {(leadDetail.activities ?? []).length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-sm">لا يوجد سجل تواصل بعد</div>
                  )}
                  {(leadDetail.activities ?? []).map((act: any) => {
                    const aType = getActivityType(act.type);
                    const AIcon = aType.icon;
                    return (
                      <div key={act._id} className="flex gap-3 group">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${aType.color}`}>
                          <AIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 bg-slate-50 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-700">{aType.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">{new Date(act._creationTime).toLocaleDateString("ar-EG")}</span>
                              {canEdit && <button onClick={() => deleteActivity({ id: act._id })} className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 text-slate-400 transition-all">
                                <X className="w-3 h-3" />
                              </button>}
                            </div>
                          </div>
                          <p className="text-xs text-slate-600">{act.notes}</p>
                          {act.outcome && <p className="text-xs text-emerald-600 mt-1">✓ {act.outcome}</p>}
                          {act.nextAction && <p className="text-xs text-amber-600 mt-1">→ {act.nextAction}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LEAD FORM MODAL ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl sm:rounded-t-2xl">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-600" />
                {editId ? "تعديل العميل المحتمل" : "عميل محتمل جديد"}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">الاسم *</label>
                  <input className="form-input" placeholder="اسم العميل" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">رقم الهاتف *</label>
                  <input className="form-input" placeholder="01xxxxxxxxx" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="form-label">البريد الإلكتروني</label>
                <input className="form-input" placeholder="example@email.com" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="form-label">مصدر العميل *</label>
                <div className="grid grid-cols-4 gap-2">
                  {SOURCES.map(s => (
                    <button key={s.value} type="button" onClick={() => setForm({ ...form, source: s.value })}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 text-xs font-medium transition-all ${form.source === s.value ? `${s.color} border-current` : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                      <span className="text-lg">{s.emoji}</span>
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label">الحالة</label>
                <select className="form-input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">الاهتمام / المنتج</label>
                  <input className="form-input" placeholder="مثال: آيفون 15" value={form.interest} onChange={e => setForm({ ...form, interest: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">الميزانية (ج.م)</label>
                  <input className="form-input" type="number" placeholder="0" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">المسؤول</label>
                  <input className="form-input" placeholder="اسم المسؤول" value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">تاريخ المتابعة</label>
                  <input className="form-input" type="date" value={form.nextFollowUpDate} onChange={e => setForm({ ...form, nextFollowUpDate: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="form-label">ملاحظات</label>
                <textarea className="form-input resize-none" rows={2} placeholder="أي ملاحظات إضافية..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">إلغاء</button>
                <button type="submit" className="btn-primary flex-1">{editId ? "حفظ التعديلات" : "إضافة العميل"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
