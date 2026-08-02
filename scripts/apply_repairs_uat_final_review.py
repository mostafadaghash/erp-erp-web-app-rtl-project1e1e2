from pathlib import Path

repairs_path = Path("src/components/RepairsPage.tsx")
print_path = Path("src/components/PrintTemplate.tsx")
repairs = repairs_path.read_text()
print_template = print_path.read_text()


def replace_once(text: str, label: str, old: str, new: str) -> str:
    if old not in text:
        raise SystemExit(f"missing expected source: {label}")
    return text.replace(old, new, 1)


def replace_last(text: str, label: str, old: str, new: str) -> str:
    index = text.rfind(old)
    if index < 0:
        raise SystemExit(f"missing expected source: {label}")
    return text[:index] + new + text[index + len(old):]


if "const [trackingBusyId, setTrackingBusyId]" not in repairs:
    repairs = replace_once(
        repairs,
        "tracking busy state",
        '  const [printTargetId, setPrintTargetId] = useState<Id<"repairs"> | null>(null);\n',
        '  const [printTargetId, setPrintTargetId] = useState<Id<"repairs"> | null>(null);\n'
        '  const [trackingBusyId, setTrackingBusyId] = useState<Id<"repairs"> | null>(null);\n',
    )

    repairs = replace_once(
        repairs,
        "branch-sensitive state reset",
        '''  const handleBranchChange = (value: string) => {
    setSelectedBranchId(value);
    resetCreateState();
    setShowForm(false);
  };
''',
        '''  const handleBranchChange = (value: string) => {
    setSelectedBranchId(value);
    resetCreateState();
    setShowForm(false);
    setEditTarget(null);
    setHistoryTarget(null);
    setTransitionTarget(null);
    setTransitionNext(null);
    setCollectionTarget(null);
    setRefundTarget(null);
    setPrintTargetId(null);
    setPrintRepair(null);
  };
''',
    )

    repairs = replace_once(
        repairs,
        "specific transition success",
        '      toast.success("تم تحديث حالة الصيانة");\n',
        '      toast.success(`تم تحديث ${transitionTarget.repairNumber} إلى ${statusConfig[transitionNext].label}`);\n',
    )

    repairs = replace_once(
        repairs,
        "tracking handlers",
        '''  const handleRotateTrackingToken = async (id: string, repairNumber: string) => {
    if (!confirm("سيتم إلغاء رابط التتبع القديم وإنشاء رابط جديد. هل تريد المتابعة؟")) return;
    try {
      const trackingToken = await rotateTrackingToken({ id: id as Id<"repairs"> });
      const url = `${window.location.origin}${window.location.pathname}#track=${trackingToken}`;
      await navigator.clipboard.writeText(url);
      toast.success(`تم تجديد رابط ${repairNumber} ونسخه`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجديد رابط التتبع");
    }
  };
''',
        '''  const copyTrackingLink = async (
    id: Id<"repairs">,
    trackingToken: string,
    repairNumber: string,
  ) => {
    if (trackingBusyId !== null) return;
    setTrackingBusyId(id);
    try {
      const url = `${window.location.origin}${window.location.pathname}#track=${trackingToken}`;
      await navigator.clipboard.writeText(url);
      toast.success(`تم نسخ رابط ${repairNumber}`);
    } catch {
      toast.error("تعذر نسخ رابط التتبع. انسخه يدويًا من رمز التتبع.");
    } finally {
      setTrackingBusyId(null);
    }
  };

  const handleRotateTrackingToken = async (
    id: Id<"repairs">,
    repairNumber: string,
  ) => {
    if (trackingBusyId !== null) return;
    if (!confirm("سيتم إلغاء رابط التتبع القديم وإنشاء رابط جديد. هل تريد المتابعة؟")) return;
    setTrackingBusyId(id);
    try {
      const trackingToken = await rotateTrackingToken({ id });
      const url = `${window.location.origin}${window.location.pathname}#track=${trackingToken}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(`تم تجديد رابط ${repairNumber} ونسخه`);
      } catch {
        toast.warning("تم تجديد الرابط لكن تعذر نسخه. انسخه يدويًا من رمز التتبع الجديد.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجديد رابط التتبع");
    } finally {
      setTrackingBusyId(null);
    }
  };
''',
    )

    repairs = replace_once(
        repairs,
        "safe tracking copy button",
        '''                      <button
                        onClick={() => {
                          const url = `${window.location.origin}${window.location.pathname}#track=${r.trackingToken}`;
                          navigator.clipboard.writeText(url);
                          toast.success("تم نسخ رابط التتبع");
                        }}
                        className="p-1.5 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition-colors text-indigo-600"
                        title="نسخ رابط التتبع"
                      >
''',
        '''                      <button
                        onClick={() => void copyTrackingLink(r._id, r.trackingToken!, r.repairNumber)}
                        disabled={trackingBusyId === r._id}
                        className="p-1.5 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition-colors text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                        title={trackingBusyId === r._id ? "جارٍ تنفيذ عملية رابط التتبع..." : "نسخ رابط التتبع"}
                      >
''',
    )

    repairs = replace_once(
        repairs,
        "tracking rotation button guard",
        '''                        <button
                          onClick={() => void handleRotateTrackingToken(r._id, r.repairNumber)}
                          className="p-1.5 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors text-amber-700"
                          title="تجديد رابط التتبع وإلغاء الرابط القديم"
                        >
''',
        '''                        <button
                          onClick={() => void handleRotateTrackingToken(r._id, r.repairNumber)}
                          disabled={trackingBusyId === r._id}
                          className="p-1.5 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                          title={trackingBusyId === r._id ? "جارٍ تنفيذ عملية رابط التتبع..." : "تجديد رابط التتبع وإلغاء الرابط القديم"}
                        >
''',
    )

    repairs = replace_once(
        repairs,
        "print request guard",
        '''                {canPrint && <button
                  onClick={() => { if (canPrint) setPrintTargetId(r._id); }}
                  className="p-1.5 bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors"
                  title="طباعة"
                >
''',
        '''                {canPrint && <button
                  onClick={() => { if (canPrint && printTargetId === null) setPrintTargetId(r._id); }}
                  disabled={printTargetId !== null}
                  className="p-1.5 bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  title={printTargetId === r._id ? "جارٍ تجهيز الطباعة..." : "طباعة"}
                >
''',
    )

    repairs = replace_once(
        repairs,
        "filtered empty state",
        '''            لا توجد طلبات صيانة
''',
        '''            {repairs.length === 0
              ? "لا توجد طلبات صيانة في هذا الفرع"
              : "لا توجد نتائج مطابقة للبحث أو الفلتر"}
''',
    )

    repairs = replace_once(
        repairs,
        "history first-page loading",
        '''            <div className="mt-4 space-y-3">
              {history.results.map((entry) => (
''',
        '''            <div className="mt-4 space-y-3">
              {history.status === "LoadingFirstPage" && (
                <p className="py-8 text-center text-sm text-slate-400">
                  جارٍ تحميل سجل الصيانة
                </p>
              )}
              {history.results.map((entry) => (
''',
    )

    repairs = replace_once(
        repairs,
        "history quality check",
        '''                  {entry.diagnosis && <p className="mt-1 text-xs">التشخيص: {entry.diagnosis}</p>}
                  {entry.reason && <p className="mt-1 text-xs text-red-700">السبب: {entry.reason}</p>}
''',
        '''                  {entry.diagnosis && <p className="mt-1 text-xs">التشخيص: {entry.diagnosis}</p>}
                  {entry.qualityCheckNotes && <p className="mt-1 text-xs">اختبار الجودة: {entry.qualityCheckNotes}</p>}
                  {entry.reason && <p className="mt-1 text-xs text-red-700">السبب: {entry.reason}</p>}
''',
    )

    repairs = replace_once(
        repairs,
        "history terminal states",
        '''              {history.results.length === 0 && <p className="py-8 text-center text-sm text-slate-400">لا توجد حركات.</p>}
              {history.status === "CanLoadMore" && (
                <button className="btn-secondary w-full" onClick={() => history.loadMore(10)}>تحميل المزيد</button>
              )}
''',
        '''              {history.status === "Exhausted" && history.results.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">لا توجد حركات.</p>
              )}
              {history.status === "CanLoadMore" && (
                <button className="btn-secondary w-full" onClick={() => history.loadMore(10)}>تحميل المزيد</button>
              )}
              {history.status === "LoadingMore" && (
                <p className="py-3 text-center text-sm text-slate-400">جارٍ تحميل المزيد</p>
              )}
''',
    )

if "history?: Array<{" not in print_template:
    print_template = replace_once(
        print_template,
        "repair print history type",
        '''  qualityCheckNotes?: string;
  employeeName?: string;
  notes?: string;
  _creationTime: number;
''',
        '''  qualityCheckNotes?: string;
  employeeName?: string;
  history?: Array<{
    fromStatus?: string;
    toStatus: string;
    date: string;
    reason?: string;
    employeeName: string;
  }>;
  notes?: string;
  _creationTime: number;
''',
    )

    history_section = '''      {data.history && data.history.length > 0 && (
        <>
          <div className="print-section-title">سجل حالات الصيانة</div>
          <table className="print-table">
            <thead>
              <tr>
                <th className="print-th">التاريخ</th>
                <th className="print-th">الانتقال</th>
                <th className="print-th">بواسطة</th>
                <th className="print-th">السبب</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((entry, index) => (
                <tr key={`${entry.date}-${entry.toStatus}-${index}`} className={index % 2 === 0 ? "print-tr-even" : ""}>
                  <td className="print-td">{entry.date}</td>
                  <td className="print-td">
                    {entry.fromStatus ? `${statusLabel[entry.fromStatus] ?? entry.fromStatus} ← ` : ""}
                    {statusLabel[entry.toStatus] ?? entry.toStatus}
                  </td>
                  <td className="print-td">{entry.employeeName}</td>
                  <td className="print-td">{entry.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

'''
    print_template = replace_last(
        print_template,
        "repair printed history section",
        '''      {/* ملاحظات */}
''',
        history_section + '''      {/* ملاحظات */}
''',
    )

repairs_path.write_text(repairs)
print_path.write_text(print_template)
