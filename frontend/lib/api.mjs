export async function api(path, { method = "GET", body, key, signal } = {}) {
  const form = body instanceof FormData;
  const response = await fetch(`/api/v1${path}`, {
    method, credentials: "same-origin", cache: "no-store", signal,
    headers: {
      ...(body !== undefined && !form ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body !== undefined ? { body: form ? body : JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error?.message || "Không thể hoàn tất yêu cầu. Vui lòng thử lại."), {
    status: response.status, code: result.error?.code, retryAfter: response.headers.get("Retry-After"),
  });
  return result;
}

export const categories = { Áo: ["XS", "S", "M", "L", "XL", "XXL"], Quần: ["XS", "S", "M", "L", "XL", "XXL"], Giày: Array.from({ length: 11 }, (_, i) => String(i + 35)), "Phụ kiện": ["FREE_SIZE"] };
export const conditions = ["Mới", "Còn mới", "Còn tốt", "Đã sử dụng", "Đã sử dụng, còn tốt"];
export const money = value => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value ?? 0);
export const date = value => value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
export const shortId = value => value ? String(value).slice(-8).toUpperCase() : "—";
export const latestVersion = listing => listing?.versions?.at(-1);
export const statusText = {
  AVAILABLE: "Đang bán", RESERVED: "Đang được giữ", SOLD: "Đã bán", PENDING: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Từ chối",
  CONFIRMED: "Đã xác nhận", COMPLETED: "Hoàn tất", CANCELLED: "Đã hủy", NEEDS_REVIEW: "Cần rà soát", RETURNED: "Đã hoàn về",
  OPEN: "Mới tiếp nhận", IN_REVIEW: "Đang xem xét", CLOSED: "Đã đóng", UNPAID: "Chưa thu COD", COLLECTED: "Đã ghi nhận thu", NOT_DUE: "Không cần thu", ACCEPTED: "Đã chấp nhận", PARTIALLY_COLLECTED: "Đã thu một phần",
  REPORT: "Báo cáo tin bán", DELIVERY: "Giao nhận", ITEM: "Món đã nhận", NO_ACTION: "Không cần xử lý", CORRECTION_REQUIRED: "Yêu cầu sửa tin", LISTING_HIDDEN: "Ẩn tin bán", RESOLVED: "Đã giải quyết", UNRESOLVED: "Chưa giải quyết", OTHER: "Khác",
};
export const label = value => statusText[value] || value || "—";
export const reasons = {
  REPORT: { INACCURATE_OR_INCOMPLETE: "Thông tin / ảnh sai hoặc thiếu lỗi", SUSPECTED_COUNTERFEIT: "Nghi hàng giả", PROHIBITED_OR_INAPPROPRIATE: "Hàng cấm / không phù hợp", OFFENSIVE_CONTENT: "Nội dung phản cảm", DUPLICATE_OR_SPAM: "Tin trùng / spam", SUSPECTED_SCAM: "Dấu hiệu lừa đảo", OTHER: "Lý do khác" },
  DELIVERY: { SELLER_NOT_SHIPPED: "Người bán chưa gửi hàng", NOT_RECEIVED: "Chưa nhận được hàng", DELIVERY_DELAYED: "Giao hàng chậm", OTHER: "Lý do khác" },
  ITEM: { WRONG_ITEM: "Nhận sai món", NOT_AS_DESCRIBED: "Tình trạng khác mô tả / lỗi không khai báo", MISSING_ACCESSORIES: "Thiếu phụ kiện", SUSPECTED_COUNTERFEIT: "Nghi hàng giả", DAMAGED_ON_ARRIVAL: "Hư hại khi nhận", OTHER: "Lý do khác" },
};

export function checkoutPayload(items, recipient) {
  return {
    items: items.map(item => ({ listingId: item.listingId, expectedPrice: item.price, expectedVersionId: item.versionId })),
    paymentMethod: "COD", recipientName: recipient.fullName.trim(), recipientPhone: recipient.phone.trim(), recipientAddress: recipient.address.trim(),
  };
}
export function complaintPayload(type, reasonCode, details, evidenceMediaIds, affectedOrderItemIds) {
  return { type, reasonCode, details: details.trim(), evidenceMediaIds, ...(type === "ITEM" ? { affectedOrderItemIds } : {}) };
}
