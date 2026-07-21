import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function FinancialHistory({ referenceType, referenceId }: { referenceType: "invoice" | "order" | "repair" | "expense"; referenceId: string }) {
  const transactions = useQuery(api.finance.referenceTransactions, { referenceType, referenceId }) ?? [];
  if (!transactions.length) return <p className="text-xs text-slate-400">لا توجد حركات مالية مرتبطة</p>;
  return <div className="space-y-1 text-xs">{transactions.map(transaction => <div key={transaction._id} className="flex justify-between"><span>{transaction.transactionNumber} — {transaction.description}</span><span>{transaction.amount.toFixed(2)}</span></div>)}</div>;
}
