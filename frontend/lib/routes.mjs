export function isRecordId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/.test(value);
}

export function safeNext(value, fallback = "/me") {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\u0000-\u0020]/.test(value) &&
    !/^\/(?:login|register)(?:\?|$)/.test(value)
    ? value
    : fallback;
}
export function notificationTarget(note, role) {
  if (note.caseId && ["ADMIN", "SUPPORT"].includes(role))
    return `/${role === "ADMIN" ? "admin" : "support"}/cases/${note.caseId}`;
  if (note.listingId)
    return `${note.type.startsWith("LISTING_") ? "/me/listings" : "/listings"}/${note.listingId}`;
  if (note.orderId && note.complaintId)
    return `/orders/${note.orderId}/complaints/${note.complaintId}`;
  if (note.orderId)
    return `/orders/${note.orderId}${note.caseId ? "/complaints" : ""}`;
  return null;
}
