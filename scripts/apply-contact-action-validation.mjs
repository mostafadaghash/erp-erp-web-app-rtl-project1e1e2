import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Patch target is not unique: ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

async function patchCustomers() {
  const path = "src/components/CustomersPage.tsx";
  let source = await readFile(path, "utf8");

  source = replaceOnce(
    source,
    'import { BookOpen, Edit3, Mail, MapPin, Phone, Plus, Search, Users, X } from "lucide-react";',
    'import { BookOpen, Edit3, Mail, MapPin, Phone, Plus, Search, Users } from "lucide-react";',
    "customer lucide import",
  );
  source = replaceOnce(
    source,
    'import { getErrorMessage } from "../lib/errors";',
    'import { getErrorMessage } from "../lib/errors";\nimport { ContactFormModal } from "./ContactFormModal";\nimport {\n  type ContactFormValues,\n  validateContactForm,\n} from "../lib/contactForm";',
    "customer validation imports",
  );
  source = replaceOnce(
    source,
    `type CustomerForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};`,
    "type CustomerForm = ContactFormValues;",
    "customer form type",
  );
  source = replaceOnce(
    source,
    `  const [form, setForm] = useState<CustomerForm>(emptyForm);

  const branchesQuery`,
    `  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const formValidation = validateContactForm(form);

  const branchesQuery`,
    "customer form validation state",
  );
  source = replaceOnce(
    source,
    `  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !form.name.trim() || !form.phone.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name,
      phone: form.phone,
      email: form.email,
      address: form.address,
      notes: form.notes,
    };
    try {
      if (editingId) {
        await updateCustomer({ id: editingId, ...payload });
        toast.success("تم تحديث بيانات العميل");
      } else {
        if (!effectiveBranchId) {
          toast.error("اختر فرع العميل أولًا");
          return;
        }
        await createCustomer({ ...payload, branchId: effectiveBranchId });
        toast.success("تمت إضافة العميل");
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          editingId ? "تعذر تحديث العميل" : "تعذر إضافة العميل",
        ),
      );
    } finally {
      setSaving(false);
    }
  };`,
    `  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!editingId && !effectiveBranchId) {
      toast.error("اختر فرع العميل أولًا");
      return;
    }
    if (!formValidation.ok) {
      toast.error(formValidation.reason);
      return;
    }
    const { payload, normalizedForm } = formValidation;
    setForm(normalizedForm);
    setSaving(true);
    try {
      if (editingId) {
        await updateCustomer({ id: editingId, ...payload });
        toast.success("تم تحديث بيانات العميل");
      } else if (effectiveBranchId) {
        await createCustomer({ ...payload, branchId: effectiveBranchId });
        toast.success("تمت إضافة العميل");
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          editingId ? "تعذر تحديث العميل" : "تعذر إضافة العميل",
        ),
      );
    } finally {
      setSaving(false);
    }
  };`,
    "customer submit validation",
  );
  source = replaceOnce(
    source,
    `    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تحديث حالة العميل"));
    } finally {`,
    `    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          isActive ? "تعذر إعادة تفعيل العميل" : "تعذر تعطيل العميل",
        ),
      );
    } finally {`,
    "customer activation error",
  );
  source = replaceOnce(
    source,
    `        <ContactModal
          title={editingId ? "تعديل بيانات العميل" : "إضافة عميل جديد"}
          form={form}
          saving={saving}
          onChange={setForm}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />`,
    `        <ContactFormModal
          title={editingId ? "تعديل بيانات العميل" : "إضافة عميل جديد"}
          nameLabel="الاسم *"
          form={form}
          saving={saving}
          validation={formValidation}
          onChange={setForm}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />`,
    "customer modal",
  );

  const legacyModal = source.indexOf("\nfunction ContactModal({");
  if (legacyModal < 0) throw new Error("Missing customer legacy modal");
  source = `${source.slice(0, legacyModal)}\n`;
  await writeFile(path, source);
}

async function patchSuppliers() {
  const path = "src/components/SuppliersPage.tsx";
  let source = await readFile(path, "utf8");

  source = replaceOnce(
    source,
    'import { getErrorMessage } from "../lib/errors";',
    'import { getErrorMessage } from "../lib/errors";\nimport { ContactFormModal } from "./ContactFormModal";\nimport {\n  type ContactFormValues,\n  validateContactForm,\n} from "../lib/contactForm";',
    "supplier validation imports",
  );
  source = replaceOnce(
    source,
    `type SupplierForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};`,
    "type SupplierForm = ContactFormValues;",
    "supplier form type",
  );
  source = replaceOnce(
    source,
    `  const [form, setForm] = useState<SupplierForm>(emptyForm);

  const effectiveBranch`,
    `  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const formValidation = validateContactForm(form);

  const effectiveBranch`,
    "supplier form validation state",
  );
  source = replaceOnce(
    source,
    `  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !form.name.trim() || !form.phone.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name,
      phone: form.phone,
      email: form.email,
      address: form.address,
      notes: form.notes,
    };
    try {
      if (editingId) {
        await updateSupplier({ id: editingId, ...payload });
        toast.success("تم تحديث بيانات المورد");
      } else {
        await createSupplier(payload);
        toast.success("تمت إضافة المورد");
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          editingId ? "تعذر تحديث المورد" : "تعذر إضافة المورد",
        ),
      );
    } finally {
      setSaving(false);
    }
  };`,
    `  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!formValidation.ok) {
      toast.error(formValidation.reason);
      return;
    }
    const { payload, normalizedForm } = formValidation;
    setForm(normalizedForm);
    setSaving(true);
    try {
      if (editingId) {
        await updateSupplier({ id: editingId, ...payload });
        toast.success("تم تحديث بيانات المورد");
      } else {
        await createSupplier(payload);
        toast.success("تمت إضافة المورد");
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          editingId ? "تعذر تحديث المورد" : "تعذر إضافة المورد",
        ),
      );
    } finally {
      setSaving(false);
    }
  };`,
    "supplier submit validation",
  );
  source = replaceOnce(
    source,
    `    } catch (error) {
      toast.error(getErrorMessage(error, "تعذر تحديث حالة المورد"));
    } finally {`,
    `    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          isActive ? "تعذر إعادة تفعيل المورد" : "تعذر تعطيل المورد",
        ),
      );
    } finally {`,
    "supplier activation error",
  );
  source = replaceOnce(
    source,
    `        <SupplierModal
          title={editingId ? "تعديل بيانات المورد" : "إضافة مورد جديد"}
          form={form}
          saving={saving}
          onChange={setForm}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />`,
    `        <ContactFormModal
          title={editingId ? "تعديل بيانات المورد" : "إضافة مورد جديد"}
          nameLabel="اسم المورد *"
          form={form}
          saving={saving}
          validation={formValidation}
          onChange={setForm}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />`,
    "supplier modal",
  );

  const legacyModal = source.indexOf("\nfunction SupplierModal({");
  if (legacyModal < 0) throw new Error("Missing supplier legacy modal");
  source = `${source.slice(0, legacyModal)}\n`;
  await writeFile(path, source);
}

async function patchRegressionTests() {
  const path = "tests/customerSupplierUiRegression.test.ts";
  let source = await readFile(path, "utf8");

  source = replaceOnce(
    source,
    `const suppliers = readFileSync(
  new URL("../src/components/SuppliersPage.tsx", import.meta.url),
  "utf8",
);`,
    `const suppliers = readFileSync(
  new URL("../src/components/SuppliersPage.tsx", import.meta.url),
  "utf8",
);
const contactModal = readFileSync(
  new URL("../src/components/ContactFormModal.tsx", import.meta.url),
  "utf8",
);`,
    "shared modal regression fixture",
  );
  source = replaceOnce(
    source,
    `test("CSU-03 customer save has a busy guard and disables modal actions", () => {
  assert.match(customers, /if \\(saving \\|\\| !form\\.name\\.trim\\(\\) \\|\\| !form\\.phone\\.trim\\(\\)\\) return/);
  assert.match(customers, /disabled=\\{saving\\}/);
  assert.match(customers, /saving \\? "جارٍ الحفظ\\.\\.\\." : "حفظ"/);
});`,
    `test("CSU-03 customer save has busy and validation guards", () => {
  assert.match(customers, /if \\(saving\\) return/);
  assert.match(customers, /if \\(!formValidation\\.ok\\)/);
  assert.match(contactModal, /disabled=\\{saving \\|\\| !validation\\.ok\\}/);
  assert.match(contactModal, /saving \\? "جارٍ الحفظ\\.\\.\\." : "حفظ"/);
});`,
    "customer save regression",
  );
  source = replaceOnce(
    source,
    `test("CSU-18 both edit forms submit every visible contact field", () => {
  for (const source of [customers, suppliers]) {
    for (const field of ["name", "phone", "email", "address", "notes"]) {
      assert.match(source, new RegExp(\`${"${field}: form\\\\.${field}"}\`), field);
    }
  }
});`,
    `test("CSU-18 both edit forms submit the normalized shared payload", () => {
  for (const source of [customers, suppliers]) {
    assert.match(source, /const formValidation = validateContactForm\\(form\\)/);
    assert.match(source, /const \\{ payload, normalizedForm \\} = formValidation/);
    assert.match(source, /setForm\\(normalizedForm\\)/);
  }
});`,
    "normalized contact payload regression",
  );

  await writeFile(path, source);
}

await patchCustomers();
await patchSuppliers();
await patchRegressionTests();
console.log("Applied contact action validation UI patch");
