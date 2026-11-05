"use client";

export function ShippingAddress({ value }) {
  return (
    <dl className="kv">
      <dt>Người nhận</dt>
      <dd>{value.fullName}</dd>
      <dt>Điện thoại</dt>
      <dd>{value.phone}</dd>
      <dt>Địa chỉ</dt>
      <dd>{value.address}</dd>
    </dl>
  );
}
