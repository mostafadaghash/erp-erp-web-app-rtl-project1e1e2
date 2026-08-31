import { useState } from "react";
import { useMutation } from "convex/react";
import { Copy, Link2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { buildEgyptWhatsAppUrl } from "../lib/utils";

function generateSecureTrackingToken(): string {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildTrackingUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}#track=${token}`;
}

export function CustomerTrackingLinkActions({
  followUpId,
  customerName,
  phone,
  sourceNumber,
  sourceType,
}: {
  followUpId: Id<"customerFollowUps">;
  customerName: string;
  phone?: string;
  sourceNumber?: string;
  sourceType: string;
}) {
  const ensureLink = useMutation(api.customerTrackingPortal.ensureLink);
  const [busyAction, setBusyAction] = useState<"copy" | "whatsapp" | null>(null);
  const eligible = sourceType === "order" || sourceType === "repair" || sourceType === "delivery";

  const resolveUrl = async () => {
    const link = await ensureLink({
      followUpId,
      proposedToken: generateSecureTrackingToken(),
    });
    return buildTrackingUrl(link.token);
  };

  const copyLink = async () => {
    if (!eligible || busyAction) return;
    setBusyAction("copy");
    try {
      const url = await resolveUrl();
      await navigator.clipboard.writeText(url);
      toast.success("تم نسخ رابط متابعة العميل");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء رابط المتابعة");
    } finally {
      setBusyAction(null);
    }
  };

  const sendWhatsApp = async () => {
    if (!eligible || busyAction) return;
    if (!phone) {
      toast.error("لا يوجد رقم هاتف مسجل للعميل");
      return;
    }
    setBusyAction("whatsapp");
    try {
      const url = await resolveUrl();
      const message = `مرحبًا ${customerName}، يمكنك متابعة حالة العملية${sourceNumber ? ` رقم ${sourceNumber}` : ""} من خلال الرابط الآمن التالي:\n${url}\nسيطلب منك آخر 4 أرقام من رقم الهاتف المسجل.`;
      window.open(buildEgyptWhatsAppUrl(phone, message), "_blank", "noopener,noreferrer");
      toast.success("تم تجهيز رابط المتابعة على واتساب");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجهيز رابط المتابعة");
    } finally {
      setBusyAction(null);
    }
  };

  if (!eligible) return null;

  return (
    <>
      <button
        type="button"
        data-testid="copy-customer-tracking-link"
        disabled={busyAction !== null}
        onClick={() => void copyLink()}
        className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
        title="إنشاء الرابط إن لم يكن موجودًا ثم نسخه"
      >
        {busyAction === "copy" ? <Link2 className="h-4 w-4 animate-pulse" /> : <Copy className="h-4 w-4" />}
        نسخ رابط المتابعة
      </button>
      <button
        type="button"
        data-testid="whatsapp-customer-tracking-link"
        disabled={busyAction !== null}
        onClick={() => void sendWhatsApp()}
        className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        title="إرسال رابط بوابة العميل عبر واتساب"
      >
        <MessageCircle className="h-4 w-4" />
        إرسال رابط المتابعة عبر واتساب
      </button>
    </>
  );
}
