import test from "node:test";
import assert from "node:assert/strict";
import {
  FOLLOW_UP_OUTCOME_LABELS,
  buildFollowUpOutcomeTransition,
  outcomeRequiresDetails,
  outcomeRequiresNextDate,
} from "../shared/customerFollowUpOutcomeRules.ts";

test("follow-up outcomes expose the requested commercial labels", () => {
  assert.deepEqual(FOLLOW_UP_OUTCOME_LABELS, {
    satisfied: "راضٍ",
    problem: "مشكلة",
    follow_up: "متابعة أخرى",
    no_answer: "لم يرد",
  });
});

test("satisfied completes the current follow-up", () => {
  assert.deepEqual(
    buildFollowUpOutcomeTransition({
      outcome: "satisfied",
      currentDate: "2026-08-30",
      currentFollowUpDate: "2026-08-30",
      currentFollowUpType: "تأكيد استلام",
    }),
    {
      status: "completed",
      followUpDate: "2026-08-30",
      followUpType: "تأكيد استلام",
      isCompleted: true,
    },
  );
});

test("problem remains open and becomes a customer-problem follow-up", () => {
  assert.deepEqual(
    buildFollowUpOutcomeTransition({
      outcome: "problem",
      currentDate: "2026-08-30",
      currentFollowUpDate: "2026-08-29",
      currentFollowUpType: "متابعة صيانة",
    }),
    {
      status: "pending",
      followUpDate: "2026-08-30",
      followUpType: "مشكلة عميل",
      isCompleted: false,
    },
  );
  assert.equal(outcomeRequiresDetails("problem"), true);
});

test("follow-up and no-answer remain open and require a next date", () => {
  for (const outcome of ["follow_up", "no_answer"] as const) {
    assert.equal(outcomeRequiresNextDate(outcome), true);
    assert.deepEqual(
      buildFollowUpOutcomeTransition({
        outcome,
        currentDate: "2026-08-30",
        currentFollowUpDate: "2026-08-30",
        currentFollowUpType: "متابعة عميل",
        nextFollowUpDate: "2026-08-31",
      }),
      {
        status: "follow_up_later",
        followUpDate: "2026-08-31",
        followUpType: "متابعة عميل",
        isCompleted: false,
      },
    );
  }
});

test("next follow-up date cannot be omitted or placed in the past", () => {
  assert.throws(
    () =>
      buildFollowUpOutcomeTransition({
        outcome: "follow_up",
        currentDate: "2026-08-30",
        currentFollowUpDate: "2026-08-30",
        currentFollowUpType: "متابعة عميل",
      }),
    /يجب تحديد موعد/,
  );
  assert.throws(
    () =>
      buildFollowUpOutcomeTransition({
        outcome: "no_answer",
        currentDate: "2026-08-30",
        currentFollowUpDate: "2026-08-30",
        currentFollowUpType: "متابعة عميل",
        nextFollowUpDate: "2026-08-29",
      }),
    /الماضي/,
  );
});
