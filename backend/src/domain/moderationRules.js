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
const deliveryReasons = new Set([
  "SELLER_NOT_SHIPPED",
  "NOT_RECEIVED",
  "DELIVERY_DELAYED",
  "OTHER",
]);
const itemReasons = new Set([
  "WRONG_ITEM",
  "NOT_AS_DESCRIBED",
  "MISSING_ACCESSORIES",
  "SUSPECTED_COUNTERFEIT",
  "DAMAGED_ON_ARRIVAL",
  "OTHER",
]);
const orderCaseOutcomes = new Set(["NO_ACTION", "RESOLVED", "UNRESOLVED", "OTHER"]);

function validObjectIdString(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

function readListingReport(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const details = typeof input.details === "string" ? input.details.trim() : "";
  const evidenceMediaIds = input.evidenceMediaIds ?? [];
  const allowedFields = new Set(["listingId", "reasonCode", "details", "evidenceMediaIds"]);

  if (
    Object.keys(input).some((key) => !allowedFields.has(key)) ||
    !validObjectIdString(input.listingId) ||
    !reportReasons.has(input.reasonCode) ||
    (input.details !== undefined && typeof input.details !== "string") ||
    details.length > 2000 ||
    (input.reasonCode === "OTHER" && !details) ||
    !Array.isArray(evidenceMediaIds) ||
    evidenceMediaIds.length > 5 ||
    new Set(evidenceMediaIds).size !== evidenceMediaIds.length ||
    !evidenceMediaIds.every(validObjectIdString)
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
    if (Object.keys(input).some((key) => !["status", "expectedVersion"].includes(key)) ||
        (input.expectedVersion !== undefined &&
          (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0))) return null;
    return {
      status: input.status,
      ...(input.expectedVersion !== undefined ? { expectedVersion: input.expectedVersion } : {}),
    };
  }
  if (Object.keys(input).some((key) => ![
    "status",
    "outcomeCode",
    "outcomeSummary",
    "internalNote",
    "listingAction",
    "expectedVersion",
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
    (input.expectedVersion !== undefined &&
      (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0)) ||
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
    ...(input.expectedVersion !== undefined ? { expectedVersion: input.expectedVersion } : {}),
  };
}

function readComplaintInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const allowed = new Set([
    "type", "reasonCode", "details", "evidenceMediaIds", "affectedOrderItemIds",
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return null;

  const reasons = input.type === "DELIVERY"
    ? deliveryReasons
    : input.type === "ITEM"
      ? itemReasons
      : null;
  const details = typeof input.details === "string" ? input.details.trim() : "";
  const evidenceMediaIds = input.evidenceMediaIds ?? [];
  const affectedOrderItemIds = input.affectedOrderItemIds;
  if (
    !reasons ||
    !reasons.has(input.reasonCode) ||
    typeof input.details !== "string" ||
    details.length < 10 ||
    details.length > 2000 ||
    !Array.isArray(evidenceMediaIds) ||
    evidenceMediaIds.length > 5 ||
    evidenceMediaIds.some((id) => !validObjectIdString(id)) ||
    new Set(evidenceMediaIds.map(String)).size !== evidenceMediaIds.length
  ) return null;

  if (input.type === "DELIVERY" && affectedOrderItemIds !== undefined) return null;
  if (input.type === "ITEM" && (
    !Array.isArray(affectedOrderItemIds) ||
    affectedOrderItemIds.length < 1 ||
    affectedOrderItemIds.length > 20 ||
    affectedOrderItemIds.some((id) => !validObjectIdString(id)) ||
    new Set(affectedOrderItemIds.map(String)).size !== affectedOrderItemIds.length
  )) return null;

  return {
    type: input.type,
    reasonCode: input.reasonCode,
    details,
    evidenceMediaIds: evidenceMediaIds.map((id) => id.toLowerCase()).sort(),
    affectedOrderItemIds: (affectedOrderItemIds || []).map((id) => id.toLowerCase()).sort(),
  };
}

function readAssignment(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (
    Object.keys(input).length !== 2 ||
    !Object.hasOwn(input, "assignedSupportId") ||
    !Number.isInteger(input.expectedVersion) ||
    input.expectedVersion < 0 ||
    (input.assignedSupportId !== null &&
      !validObjectIdString(input.assignedSupportId))
  ) return null;
  return {
    assignedSupportId: input.assignedSupportId === null ? null : input.assignedSupportId.toLowerCase(),
    expectedVersion: input.expectedVersion,
  };
}

function readOrderCaseDecision(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (input.status === "IN_REVIEW") {
    return Object.keys(input).length === 2 &&
      Object.hasOwn(input, "expectedVersion") &&
      Number.isInteger(input.expectedVersion) && input.expectedVersion >= 0
      ? { status: "IN_REVIEW", expectedVersion: input.expectedVersion }
      : null;
  }
  if (Object.keys(input).some((key) => ![
    "status", "outcomeCode", "outcomeSummary", "internalNote", "expectedVersion",
  ].includes(key))) return null;

  const outcomeSummary = typeof input.outcomeSummary === "string" ? input.outcomeSummary.trim() : "";
  const internalNote = input.internalNote === undefined
    ? ""
    : typeof input.internalNote === "string"
      ? input.internalNote.trim()
      : null;
  if (
    input.status !== "CLOSED" ||
    !orderCaseOutcomes.has(input.outcomeCode) ||
    !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 ||
    outcomeSummary.length < 10 || outcomeSummary.length > 1000 ||
    internalNote === null || internalNote.length > 2000
  ) return null;

  return {
    status: "CLOSED",
    outcomeCode: input.outcomeCode,
    outcomeSummary,
    internalNote,
    expectedVersion: input.expectedVersion,
  };
}

module.exports = {
  readListingReport,
  readCaseDecision,
  readComplaintInput,
  readAssignment,
  readOrderCaseDecision,
};
