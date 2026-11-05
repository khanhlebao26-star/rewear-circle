"use client";

import { label } from "@/lib/api.mjs";

export function Badge({ value, children, tone }) {
  return (
    <span
      className={`badge ${tone || (["REJECTED", "NEEDS_REVIEW"].includes(value) ? "red" : ["PENDING", "OPEN", "UNPAID", "RESERVED"].includes(value) ? "amber" : ["CLOSED", "SOLD", "NOT_DUE", "CANCELLED"].includes(value) ? "gray" : "")}`}
    >
      {children || label(value)}
    </span>
  );
}
