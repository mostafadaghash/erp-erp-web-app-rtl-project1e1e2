from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from collections import Counter, defaultdict
import re

ROOT = Path('.')
CONVEX = ROOT / 'convex'
SRC = ROOT / 'src'
OUT = ROOT / 'docs' / 'PERFORMANCE_INDEX_AUDIT.md'

SEVERITY_ORDER = {'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3}
LARGE_TABLE_HINTS = {
    'orders', 'invoices', 'inventoryMovements', 'journalEntries', 'journalLines',
    'auditLogs', 'supplierLedgerEntries', 'customerLedgerEntries', 'financialTransactions',
    'deliveries', 'repairs', 'shipments', 'payments', 'expenses', 'salesReturns',
    'purchaseReturns', 'purchaseReceipts', 'codSettlements', 'deliveryConfirmations',
}

MODULE_RULES = [
    ('orders', 'Orders'), ('invoice', 'Invoices'), ('product', 'Products'),
    ('inventory', 'Inventory'), ('deliver', 'Delivery/COD'), ('cod', 'Delivery/COD'),
    ('repair', 'Repairs'), ('customer', 'Customers'), ('supplier', 'Suppliers'),
    ('finance', 'Finance'), ('generalledger', 'General Ledger'), ('journal', 'General Ledger'),
    ('audit', 'Audit Log'), ('report', 'Reports'), ('employee', 'Employees'),
    ('setting', 'Settings'), ('shipment', 'Shipments'), ('expense', 'Expenses'),
    ('lead', 'CRM/Leads'), ('branch', 'Branches'), ('categor', 'Products'),
    ('salesreturn', 'Sales Returns'), ('purchasereturn', 'Purchase Returns'),
]

@dataclass(frozen=True)
class Finding:
    severity: str
    category: str
    module: str
    file: str
    line: int
    symbol: str
    evidence: str
    impact: str
    recommendation: str
    index_design: str
    behavior_safe: str


def module_for(path: Path) -> str:
    compact = path.stem.lower().replace('_', '')
    for needle, label in MODULE_RULES:
        if needle in compact:
            return label
    if 'lib' in path.parts:
        return 'Shared/Infrastructure'
    return 'Other'


def nearest_symbol(source: str, pos: int) -> str:
    prefix = source[:pos]
    matches = list(re.finditer(r'export\s+const\s+(\w+)\s*=\s*(?:query|internalQuery|mutation|internalMutation)\s*\(', prefix))
    if matches:
        return matches[-1].group(1)
    fn = list(re.finditer(r'(?:async\s+)?function\s+(\w+)\s*\(', prefix))
    return fn[-1].group(1) if fn else 'module scope'


def line_no(source: str, pos: int) -> int:
    return source.count('\n', 0, pos) + 1


def clip(text: str, limit: int = 180) -> str:
    return re.sub(r'\s+', ' ', text.strip())[:limit]


def statement_window(source: str, pos: int, before: int = 500, after: int = 260) -> str:
    return source[max(0, pos-before): min(len(source), pos+after)]


def query_table(context: str) -> str | None:
    matches = re.findall(r'\.query\("([^"]+)"\)', context)
    return matches[-1] if matches else None


def has_auth_guard(block: str) -> bool:
    return bool(re.search(r'require(?:Permission|Admin|Auth|ModulePermission)|assertBranchAccess|resolveWriteBranch|selectableBranch|filterByBranch', block))


def function_block(source: str, pos: int) -> str:
    start = max(source.rfind('export const ', 0, pos), source.rfind('function ', 0, pos))
    if start < 0:
        start = max(0, pos - 1200)
    return source[start:min(len(source), pos + 1600)]


def add(findings: list[Finding], **kwargs: str | int) -> None:
    findings.append(Finding(**kwargs))


def scan_convex_file(path: Path, findings: list[Finding]) -> None:
    source = path.read_text(encoding='utf-8')
    rel = path.as_posix()
    module = module_for(path)

    for match in re.finditer(r'\.collect\s*\(\s*\)', source):
        pos = match.start()
        symbol = nearest_symbol(source, pos)
        context = statement_window(source, pos)
        block = function_block(source, pos)
        table = query_table(context) or 'unknown table'
        has_index = '.withIndex(' in context
        legacy = bool(re.search(r'legacy|migrat|seed|rebuild|backfill|initialize', symbol, re.I)) or path.stem == 'seed'
        aggregation = bool(re.search(r'reduce\(|\.length|\.filter\(|sort\(|stats|report', block, re.I))
        public_query = bool(re.search(rf'export\s+const\s+{re.escape(symbol)}\s*=\s*(?:query|internalQuery)', block))

        if legacy:
            severity = 'Medium'
            impact = 'المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.'
        elif table in LARGE_TABLE_HINTS and not has_index:
            severity = 'Critical' if public_query or aggregation else 'High'
            impact = 'قراءة جدول كبير بالكامل في طلب واحد قد تتجاوز حدود Convex وتزيد زمن الاستجابة والتكلفة مع نمو البيانات.'
        elif not has_index:
            severity = 'High' if public_query or aggregation else 'Medium'
            impact = 'الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.'
        else:
            severity = 'Medium'
            impact = 'استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.'

        index_design = (
            f'استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `{table}`.'
            if not has_index else
            f'حافظ على الـIndex الحالي للجدول `{table}` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.'
        )
        behavior_safe = 'نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.'
        if legacy:
            behavior_safe = 'جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.'

        add(findings,
            severity=severity,
            category='Unbounded collect',
            module=module,
            file=rel,
            line=line_no(source, pos),
            symbol=symbol,
            evidence=clip(context),
            impact=impact,
            recommendation='استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.',
            index_design=index_design,
            behavior_safe=behavior_safe,
        )

    for match in re.finditer(r'\.filter\s*\(\s*q\s*=>\s*q\.(?:eq|gte|lte|gt|lt)\(\s*q\.field\("([^"]+)"\)', source):
        pos = match.start()
        context = statement_window(source, pos, before=450, after=220)
        if '.withIndex(' in context:
            continue
        field = match.group(1)
        table = query_table(context) or 'unknown table'
        symbol = nearest_symbol(source, pos)
        severity = 'High' if table in LARGE_TABLE_HINTS or field in {'branchId', 'date', 'status', 'createdAt', 'userId'} else 'Medium'
        add(findings,
            severity=severity,
            category='Filter without index',
            module=module,
            file=rel,
            line=line_no(source, pos),
            symbol=symbol,
            evidence=clip(context),
            impact='Convex يقرأ مساحة أوسع ثم يطبق الفلتر، وقد يتحول الاستعلام إلى مسح كبير أو يفشل عند نمو البيانات.',
            recommendation='أضف/استخدم `withIndex` بدل `.filter` للمفاتيح الانتقائية، واترك `.filter` فقط للشروط الثانوية على مجموعة محدودة.',
            index_design=f'Index مقترح على `{table}` يبدأ بـ`{field}`؛ أضف `branchId` أولًا عندما تكون الملكية حسب الفرع، ثم status/date حسب نمط الاستعلام.',
            behavior_safe='نعم، إذا طابق ترتيب حقول الـIndex شروط المساواة والنطاق الحالية وتمت مقارنة النتائج قبل/بعد.',
        )

    for method, category in [('first', 'Unindexed first'), ('take', 'Fixed take / truncation')]:
        pattern = rf'\.{method}\s*\('
        for match in re.finditer(pattern, source):
            pos = match.start()
            context = statement_window(source, pos, before=420, after=160)
            if '.query(' not in context or '.withIndex(' in context:
                continue
            symbol = nearest_symbol(source, pos)
            table = query_table(context) or 'unknown table'
            if method == 'first':
                severity = 'Medium'
                impact = '`first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.'
                recommendation = 'استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.'
            else:
                severity = 'Medium' if table in LARGE_TABLE_HINTS else 'Low'
                impact = '`take()` bounded لكنه قد يقطع النتائج بصمت أو يقرأ أول N دون فلتر/ترتيب مدعوم بـIndex.'
                recommendation = 'وثّق الحد كسلوك مقصود أو استبدله بـCursor Pagination، وأضف Index للترتيب/الفلتر.'
            add(findings,
                severity=severity,
                category=category,
                module=module,
                file=rel,
                line=line_no(source, pos),
                symbol=symbol,
                evidence=clip(context),
                impact=impact,
                recommendation=recommendation,
                index_design=f'Index على `{table}` يطابق مفاتيح البحث والترتيب المستخدمة في `{symbol}`.',
                behavior_safe='نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.',
            )

    for match in re.finditer(r'return\s+(?:await\s+)?ctx\.db\.query\("([^"]+)"\)[^;]{0,260}(?:collect|paginate|take)\s*\(', source):
        pos = match.start()
        table = match.group(1)
        symbol = nearest_symbol(source, pos)
        context = statement_window(source, pos, before=100, after=360)
        add(findings,
            severity='Medium' if 'paginate' in match.group(0) else 'High',
            category='Raw document DTO',
            module=module,
            file=rel,
            line=line_no(source, pos),
            symbol=symbol,
            evidence=clip(context),
            impact='إرجاع مستندات الجدول كاملة يرفع حجم payload وقد يكشف حقولًا داخلية أو مالية لا تحتاجها الواجهة.',
            recommendation='حوّل النتائج إلى DTO allowlist داخل الـBackend، وأعد فقط الحقول اللازمة للعرض والإجراءات المصرح بها.',
            index_design=f'لا يعتمد على Index مباشرة؛ طبّق DTO بعد الاستعلام المحدود للجدول `{table}`.',
            behavior_safe='نعم، بشرط حصر جميع الحقول التي تستخدمها الواجهة والاختبارات قبل إزالة الباقي.',
        )

    lines = source.splitlines()
    for i, line in enumerate(lines):
        if re.search(r'\bfor\s*\(|\bfor\s+\w+\s+of\b|\.map\s*\(\s*async', line):
            joined = '\n'.join(lines[i:i+22])
            db_awaits = len(re.findall(r'await\s+ctx\.db\.(?:get|query)', joined))
            if db_awaits >= 1:
                add(findings,
                    severity='High' if db_awaits >= 2 else 'Medium',
                    category='Potential N+1',
                    module=module,
                    file=rel,
                    line=i+1,
                    symbol=nearest_symbol(source, source.find(line)),
                    evidence=clip(joined, 220),
                    impact='تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.',
                    recommendation='اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.',
                    index_design='أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.',
                    behavior_safe='نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.',
                )

    query_exports = list(re.finditer(r'export\s+const\s+(\w+)\s*=\s*(query|internalQuery)\s*\(', source))
    for idx, m in enumerate(query_exports):
        start = m.start()
        end = query_exports[idx+1].start() if idx+1 < len(query_exports) else min(len(source), start + 6000)
        block = source[start:end]
        if 'ctx.db.query(' not in block or has_auth_guard(block):
            continue
        symbol = m.group(1)
        if re.search(r'public|tracking|setupStatus', symbol, re.I):
            continue
        add(findings,
            severity='High',
            category='Query authorization review',
            module=module,
            file=rel,
            line=line_no(source, start),
            symbol=symbol,
            evidence=clip(block[:500]),
            impact='الاستعلام يقرأ قاعدة البيانات دون حارس صلاحية/فرع واضح في نفس المسار؛ قد يكون مقصودًا لكنه يحتاج إثباتًا.',
            recommendation='أثبت أن الاستعلام public مقصود وDTO محدود، أو أضف requirePermission + branch assertion قبل القراءة.',
            index_design='ليس Index فقط؛ يجب تثبيت authorization وbranch scope أولًا ثم تصميم الـIndex على نفس scope.',
            behavior_safe='يتطلب مراجعة وظيفية؛ لا تغيّر الوصول قبل تحديد المستهلك العام والغرض الأمني.',
        )


def scan_ui_file(path: Path, findings: list[Finding]) -> None:
    source = path.read_text(encoding='utf-8')
    rel = path.as_posix()
    module = module_for(path)

    for match in re.finditer(r'\.slice\s*\([^\n]{0,120}(?:page|Page|offset|startIndex|pageSize)', source):
        pos = match.start()
        add(findings,
            severity='High',
            category='Client-side pagination',
            module=module,
            file=rel,
            line=line_no(source, pos),
            symbol='React component',
            evidence=clip(statement_window(source, pos, 240, 180)),
            impact='الواجهة تجلب مجموعة أكبر ثم تقسمها محليًا؛ لا تحمي الـBackend من نمو البيانات وتنتج أرقامًا/بحثًا جزئيًا.',
            recommendation='استخدم `usePaginatedQuery` وCursor من Convex، واجعل الفلاتر الأساسية جزءًا من query args.',
            index_design='Endpoint paginated مع Index على branchId ثم status/date/search key بحسب الشاشة.',
            behavior_safe='نعم، مع الحفاظ على ترتيب العناصر وحالة الفلاتر عند تحميل المزيد.',
        )

    if 'useQuery(' in source:
        for match in re.finditer(r'\.(filter|sort)\s*\(', source):
            pos = match.start()
            context = statement_window(source, pos, 500, 180)
            if 'useMemo' not in context and 'useQuery' not in source[max(0,pos-1500):pos]:
                continue
            add(findings,
                severity='Medium',
                category='Client-side filtering/sorting',
                module=module,
                file=rel,
                line=line_no(source, pos),
                symbol='React component',
                evidence=clip(context),
                impact='الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.',
                recommendation='انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.',
                index_design='Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.',
                behavior_safe='نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.',
            )

    if 'useQuery(' in source and re.search(r'\.reduce\(|\.length\s*[),}]', source):
        for match in re.finditer(r'\.reduce\(', source):
            pos = match.start()
            add(findings,
                severity='Medium',
                category='Client-side aggregation',
                module=module,
                file=rel,
                line=line_no(source, pos),
                symbol='React component',
                evidence=clip(statement_window(source, pos, 320, 180)),
                impact='التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.',
                recommendation='استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.',
                index_design='Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.',
                behavior_safe='جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.',
            )


def dedupe(findings: list[Finding]) -> list[Finding]:
    seen = set()
    result = []
    for item in findings:
        key = (item.category, item.file, item.line, item.symbol)
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def confidence_note(item: Finding) -> str:
    if item.category in {'Unbounded collect', 'Client-side pagination'}:
        return 'مؤكد من المصدر'
    if item.category in {'Filter without index', 'Raw document DTO', 'Potential N+1'}:
        return 'مرشح قوي — تحقق قبل الإصلاح'
    return 'يحتاج مراجعة سياق'


def render(findings: list[Finding]) -> str:
    findings = sorted(findings, key=lambda f: (SEVERITY_ORDER[f.severity], f.module, f.file, f.line))
    counts = Counter(f.severity for f in findings)
    modules = defaultdict(list)
    for f in findings:
        modules[f.module].append(f)

    lines: list[str] = []
    lines += [
        '# Performance & Index Audit', '',
        '> تدقيق قراءة فقط مولّد من أحدث نسخة للمستودع. لم يغيّر أي ملف إنتاجي أو Schema أو سلوك تشغيل.', '',
        '## النطاق والمنهجية', '',
        '- فحص جميع ملفات `convex/**/*.ts` باستثناء `_generated`، وجميع مكونات `src/**/*.tsx`.',
        '- البحث عن `collect()` غير المحدود، الفلاتر دون Index، `first/take` دون Index ظاهر، N+1، DTOs الخام، pagination/aggregation المحلية، واستعلامات دون حارس صلاحية واضح.',
        '- الدرجات أدناه Static Analysis؛ البنود الموسومة «مرشح قوي» تحتاج تأكيدًا يدويًا قبل أي تعديل.',
        '- لم يتم قياس latency أو cardinality على بيانات Production؛ شدة بعض البنود قد ترتفع أو تنخفض بعد القياس.', '',
        '## الملخص التنفيذي', '',
        f'- **إجمالي البنود:** {len(findings)}',
        f'- **Critical:** {counts.get("Critical", 0)}',
        f'- **High:** {counts.get("High", 0)}',
        f'- **Medium:** {counts.get("Medium", 0)}',
        f'- **Low:** {counts.get("Low", 0)}', '',
        '### أعلى 10 إصلاحات أولوية', ''
    ]

    for i, f in enumerate(findings[:10], 1):
        lines.append(f'{i}. **[{f.severity}] {f.module} — `{f.file}:{f.line}` / `{f.symbol}`**: {f.category}. {f.recommendation}')
    lines += ['', '## النتائج حسب الوحدة', '']

    requested_order = [
        'Orders','Invoices','Products','Inventory','Delivery/COD','Repairs','Customers','Suppliers',
        'Finance','General Ledger','Audit Log','Reports','Employees','Settings','Shipments','Expenses',
        'Sales Returns','Purchase Returns','CRM/Leads','Branches','Shared/Infrastructure','Other'
    ]
    ordered_modules = [m for m in requested_order if m in modules] + sorted(set(modules)-set(requested_order))

    for module in ordered_modules:
        items = modules[module]
        lines += [f'### {module}', '', f'عدد البنود: **{len(items)}**', '']
        for idx, f in enumerate(items, 1):
            safe_evidence = f.evidence.replace('`', "'")
            lines += [
                f'#### {module}-{idx}: [{f.severity}] {f.category}', '',
                f'- **الموقع:** `{f.file}:{f.line}` — `{f.symbol}`',
                f'- **الثقة:** {confidence_note(f)}',
                f'- **الدليل:** `{safe_evidence}`',
                f'- **الأثر:** {f.impact}',
                f'- **الإصلاح المقترح:** {f.recommendation}',
                f'- **Index / Query design:** {f.index_design}',
                f'- **إمكانية الإصلاح دون تغيير السلوك:** {f.behavior_safe}', ''
            ]

    lines += [
        '## ترتيب Pull Requests المقترح', '',
        '1. **Critical unbounded reads:** تحويل القوائم/الإحصاءات ذات الجداول الكبيرة إلى Cursor Pagination أو counters، مع اختبارات branch/permission.',
        '2. **Branch-scoped master lists:** Products/Customers/Employees/Branches والـpickers التي ما زالت تقرأ كامل الجدول ثم تفلتر.',
        '3. **Finance & ledgers:** Pagination وIndexes مركبة للـfinancial transactions والقيود ودفاتر العملاء والموردين والتقارير.',
        '4. **Operational modules:** Invoices/Deliveries/Repairs/Shipments/Returns؛ نقل status/date/search filters إلى Backend indexed.',
        '5. **Frontend pagination cleanup:** إزالة `slice`/pageSize المحلية، وتوضيح البحث داخل الصفحات المحملة مقابل البحث الكلي.',
        '6. **DTO hardening:** استبدال المستندات الخام بـallowlisted DTOs وتقليل payload، خصوصًا البيانات المالية والتكلفة.',
        '7. **N+1 cleanup:** تجميع العلاقات في استعلامات batched/indexed والحفاظ على ترتيب النتائج.', '',
        '## اختبارات القبول المطلوبة لكل PR', '',
        '- نتائج متطابقة قبل/بعد على dataset صغير مرجعي.',
        '- Cursor pagination مستقرة دون تكرار أو فقد عند إضافة سجلات جديدة.',
        '- عزل الفرع وصلاحيات العرض fail-closed في Backend، لا UI فقط.',
        '- الفلاتر والتواريخ تعمل على كامل dataset، لا الصفحات المحملة فقط.',
        '- DTO لا يكشف تكلفة/ربح/هوية/بيانات داخلية دون صلاحية.',
        '- Load More، Loading First Page، Empty، Exhausted، والخطأ الشبكي حالات مستقلة.',
        '- قياس عدد القراءات وحجم payload ووقت الاستجابة قبل/بعد على Staging.', '',
        '## المخاطر والنقاط التي تحتاج اختبارًا يدويًا', '',
        '- بعض `collect()` قد تكون مقصودة لجداول إعدادات صغيرة؛ يجب إثبات سقف الحجم قبل إبقائها.',
        '- تغيير ترتيب حقول Index قد يؤثر على إمكانية تطبيق range بعد equality؛ راجع قواعد Convex لكل query.',
        '- تحويل البحث المحلي إلى خادمي قد يغير التطبيع العربي وحساسية الأحرف؛ ثبّت حالات اختبار عربية.',
        '- Pagination مع بيانات تتغير لحظيًا تحتاج اختبار التكرار/الفقد أثناء Load More.',
        '- Counters والإحصاءات المسبقة تحتاج Backfill ومقارنة مع المصدر قبل تفعيلها.',
        '- لا تدمج إصلاحات الأداء مع تغييرات محاسبية أو صلاحيات في PR واحد.', '',
        '## حدود التقرير', '',
        '- التقرير لا يعدّل الكود ولا يثبت أن كل مرشح يمثل عطلًا فعليًا.',
        '- لا توجد بيانات Production أو traces ضمن هذا التدقيق.',
        '- أرقام السطور تقريبية بالنسبة للـHead الذي ولّد التقرير وقد تتحرك بعد الدمج.', ''
    ]
    return '\n'.join(lines)


def main() -> None:
    findings: list[Finding] = []
    for path in sorted(CONVEX.rglob('*.ts')):
        if '_generated' in path.parts or path.name.endswith('.test.ts'):
            continue
        scan_convex_file(path, findings)
    for path in sorted(SRC.rglob('*.tsx')):
        scan_ui_file(path, findings)
    findings = dedupe(findings)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(render(findings), encoding='utf-8')
    print(f'Wrote {OUT} with {len(findings)} findings')


if __name__ == '__main__':
    main()
