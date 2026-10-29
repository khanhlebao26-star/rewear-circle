const mongoose = require("mongoose");

const reportReasons = new Set([
  "INACCURATE_OR_INCOMPLETE",
  "SUSPECTED_COUNTERFEIT",
  "PROHIBITED_OR_INAPPROPRIATE",
  "OFFENSIVE_CONTENT",
  "DUPLICATE_OR_SPAM",
  "SUSPECTED_SCAM",
  "OTHER",
]);

const caseOutcomes = new Set([
  "NO_ACTION",
  "CORRECTION_REQUIRED",
  "LISTING_HIDDEN",
  "OTHER",
]);

function readListingReport(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const details = typeof input.details === "string" ? input.details.trim() : "";
  const evidenceMediaIds = input.evidenceMediaIds ?? [];
  const allowedFields = new Set(["listingId", "reasonCode", "details", "evidenceMediaIds"]);

  if (
    Object.keys(input).some((key) => !allowedFields.has(key)) ||
    !mongoose.isValidObjectId(input.listingId) ||
    !reportReasons.has(input.reasonCode) ||
    (input.details !== undefined && typeof input.details !== "string") ||
    details.length > 2000 ||
    (input.reasonCode === "OTHER" && !details) ||
    !Array.isArray(evidenceMediaIds) ||
    evidenceMediaIds.length > 5 ||
    new Set(evidenceMediaIds).size !== evidenceMediaIds.length ||
    !evidenceMediaIds.every((id) => mongoose.isValidObjectId(id))
  ) {
    return null;
  }

  return {
    listingId: String(input.listingId),
    reasonCode: input.reasonCode,
    details,
    evidenceMediaIds,
  };
}

function readCaseDecision(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (input.status === "IN_REVIEW") {
    return Object.keys(input).length === 1 ? { status: input.status } : null;
  }
  if (Object.keys(input).some((key) => ![
    "status",
    "outcomeCode",
    "outcomeSummary",
    "internalNote",
    "listingAction",
  ].includes(key))) return null;
  if (input.status !== "CLOSED" || !caseOutcomes.has(input.outcomeCode)) return null;

  const outcomeSummary = typeof input.outcomeSummary === "string"
    ? input.outcomeSummary.trim()
    : "";
  const internalNote = input.internalNote === undefined
    ? ""
    : typeof input.internalNote === "string"
      ? input.internalNote.trim()
      : null;
  const listingAction = input.listingAction;

  if (
    !outcomeSummary ||
    outcomeSummary.length > 1000 ||
    internalNote === null ||
    internalNote.length > 2000 ||
    (listingAction !== undefined && !["HIDE", "SHOW"].includes(listingAction)) ||
    (input.outcomeCode === "CORRECTION_REQUIRED" && listingAction === "SHOW") ||
    (input.outcomeCode === "LISTING_HIDDEN" && listingAction === "SHOW") ||
    (input.outcomeCode === "NO_ACTION" && listingAction !== undefined)
  ) {
    return null;
  }

  return {
    status: "CLOSED",
    outcomeCode: input.outcomeCode,
    outcomeSummary,
    internalNote,
    listingAction,
  };
}

module.exports = { readListingReport, readCaseDecision };
