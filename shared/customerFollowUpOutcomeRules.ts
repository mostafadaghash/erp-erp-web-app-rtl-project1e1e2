export const FOLLOW_UP_OUTCOMES = [
  "satisfied",
  "problem",
  "follow_up",
  "no_answer",
] as const;

export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number];

export const FOLLOW_UP_OUTCOME_LABELS: Record<FollowUpOutcome, string> = {
  satisfied: "راضٍ",
  problem: "مشكلة",
  follow_up: "متابعة أخرى",
  no_answer: "لم يرد",
};

export const FOLLOW_UP_OUTCOME_DESCRIPTIONS: Record<FollowUpOutcome, string> = {
  satisfied: "تنتهي المتابعة لأن العميل راضٍ ولا يحتاج إجراء آخر.",
  problem: "تظل المتابعة مفتوحة وتتحول إلى متابعة مشكلة عميل.",
  follow_up: "تظل المتابعة مفتوحة ويجب تحديد موعد المتابعة القادمة.",
  no_answer: "تسجل محاولة التواصل وتظل المتابعة مفتوحة مع تحديد موعد المحاولة القادمة.",
};

export function outcomeRequiresNextDate(outcome: FollowUpOutcome): boolean {
  return outcome === "follow_up" || outcome === "no_answer";
}

export function outcomeRequiresDetails(outcome: FollowUpOutcome): boolean {
  return outcome === "problem";
}

export function buildFollowUpOutcomeTransition(input: {
  outcome: FollowUpOutcome;
  currentDate: string;
  currentFollowUpDate: string;
  currentFollowUpType: string;
  nextFollowUpDate?: string;
}): {
  status: "pending" | "follow_up_later" | "completed";
  followUpDate: string;
  followUpType: string;
  isCompleted: boolean;
} {
  const { outcome, currentDate, currentFollowUpDate, currentFollowUpType, nextFollowUpDate } = input;

  if (outcome === "satisfied") {
    return {
      status: "completed",
      followUpDate: currentFollowUpDate,
      followUpType: currentFollowUpType,
      isCompleted: true,
    };
  }

  if (outcome === "problem") {
    return {
      status: "pending",
      followUpDate: currentDate,
      followUpType: "مشكلة عميل",
      isCompleted: false,
    };
  }

  if (!nextFollowUpDate) {
    throw new Error("يجب تحديد موعد المتابعة القادمة");
  }
  if (nextFollowUpDate < currentDate) {
    throw new Error("موعد المتابعة القادمة لا يمكن أن يكون في الماضي");
  }

  return {
    status: "follow_up_later",
    followUpDate: nextFollowUpDate,
    followUpType: currentFollowUpType,
    isCompleted: false,
  };
}
