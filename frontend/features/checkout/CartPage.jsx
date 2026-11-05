"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/layout/AppShell";
import useResource from "@/hooks/useResource";
import { useMutation } from "@/hooks/useMutation";
import { Breadcrumb, Heading } from "@/components/ui/PageNavigation";
import { Empty, ErrorState, Notice, Resource } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/FormFields";
import { Icon } from "@/components/ui/Icon";
import { ItemRow } from "@/components/ui/ItemRow";
import { checkoutPayload, money } from "@/lib/api.mjs";

export function CartPage({ checkout = false }) {
  const resource = useResource("/cart");
  const mutation = useMutation();
  const session = useSession();
  const { syncCartCount, refreshCart } = session;
  const router = useRouter();
  const items = resource.data?.items || [];
  const available = items.filter((item) => item.availability === "AVAILABLE");
  const total = available.reduce((sum, item) => sum + item.price, 0);
  const unavailable = items.length !== available.length;
  useEffect(() => {
    if (resource.data) syncCartCount(resource.data.items.length);
  }, [resource.data, syncCartCount]);
  async function remove(id) {
    if (await mutation.run(`/cart/items/${id}`, undefined, "DELETE")) {
      resource.reload();
    }
  }
  async function place(event) {
    event.preventDefault();
    if (unavailable || !available.length) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const result = await mutation.run(
      "/checkouts",
      checkoutPayload(items, values),
    );
    if (result) {
      refreshCart();
      router.push(`/checkouts/${result.data.checkoutId}/success`);
    }
  }
  const summary = (
    <aside className="panel">
      <p className="eyebrow">
        {checkout ? "KIỂM TRA LẠI MÓN ĐỒ" : "TỔNG GIỎ HÀNG"}
      </p>
      {checkout &&
        items.map((item) => <ItemRow item={item} key={item.listingId} />)}
      <div className="summary-row">
        <span>Giá các món khả dụng</span>
        <strong>{money(total)}</strong>
      </div>
      <div className="summary-row">
        <span>Vận chuyển</span>
        <span>Đã nằm trong giá</span>
      </div>
      <div className="summary-row summary-total">
        <span>Tổng cộng</span>
        <strong>{money(total)}</strong>
      </div>
      {checkout ? (
        <button className="btn full" disabled={mutation.pending || unavailable}>
          Xác nhận đặt hàng <Icon name="arrow" size={15} />
        </button>
      ) : available.length && !unavailable ? (
        <Link className="btn full" href="/checkout">
          Tiếp tục đặt hàng <Icon name="arrow" size={15} />
        </Link>
      ) : (
        <Notice tone="amber">
          Bỏ các món không còn khả dụng trước khi đặt.
        </Notice>
      )}
      <p className="caption mt">
        Thanh toán khi nhận hàng (COD). Mỗi người bán sẽ có một đơn riêng.
      </p>
    </aside>
  );
  return (
    <>
      <Breadcrumb
        href={checkout ? "/cart" : "/listings"}
        back={checkout ? "Giỏ hàng" : "Khám phá"}
      >
        {checkout ? "Đặt hàng" : "Giỏ hàng"}
      </Breadcrumb>
      <Heading
        eyebrow="MÓN ĐỒ BẠN ĐÃ CHỌN"
        title={
          checkout
            ? "Gửi đến bạn, bằng một vòng tròn mới."
            : "Giỏ hàng của bạn."
        }
        description="Thêm vào giỏ chưa giữ món. Tình trạng và giá được kiểm tra lại khi đặt hàng."
      />
      <div className="stepper">
        <span className={checkout ? "" : "active"}>
          <b>{checkout ? "✓" : "1"}</b>Giỏ hàng
        </span>
        <span className={checkout ? "active" : ""}>
          <b>2</b>Thông tin & xác nhận
        </span>
        <span>
          <b>3</b>Hoàn tất đặt hàng
        </span>
      </div>
      {mutation.error && (
        <div className="mb">
          <ErrorState error={mutation.error} reload={resource.reload} />
        </div>
      )}
      <Resource resource={resource}>
        {!items.length ? (
          <Empty title="Giỏ hàng đang chờ bạn.">
            Một món đồ hợp gu có thể đang đợi ở vòng tròn này.
          </Empty>
        ) : checkout ? (
          <form className="two-col" onSubmit={place}>
            <div className="stack">
              <section className="panel">
                <div className="panel-title">
                  <h2>Thông tin nhận hàng</h2>
                  <Icon name="truck" />
                </div>
                <div className="form-grid">
                  <Field
                    label="Họ tên người nhận *"
                    name="fullName"
                    minLength={2}
                    maxLength={100}
                    required
                    autoComplete="name"
                  />
                  <Field
                    label="Số điện thoại *"
                    name="phone"
                    type="tel"
                    pattern="[+]?[0-9]{9,15}"
                    required
                    autoComplete="tel"
                  />
                  <div className="span2">
                    <Field label="Địa chỉ nhận hàng *">
                      <textarea
                        name="address"
                        minLength={10}
                        maxLength={500}
                        required
                        autoComplete="street-address"
                      />
                    </Field>
                  </div>
                </div>
              </section>
              <section className="panel">
                <h2>Phương thức thanh toán</h2>
                <label className="option-box">
                  <input type="radio" checked readOnly />
                  <span>
                    <strong>Thanh toán khi nhận hàng (COD)</strong>
                    <p>Thanh toán riêng cho từng đơn của từng người bán.</p>
                  </span>
                </label>
              </section>
            </div>
            {summary}
          </form>
        ) : (
          <div className="two-col">
            <section className="panel">
              <div className="panel-title">
                <h2>{items.length} món đã chọn</h2>
                <Link className="link" href="/listings">
                  Tiếp tục khám phá
                </Link>
              </div>
              {items.map((item) => (
                <ItemRow item={item} key={item.listingId}>
                  <p className="caption">
                    {item.availability === "AVAILABLE"
                      ? "Số lượng: 1"
                      : "Món không còn khả dụng"}
                  </p>
                  <button
                    className="link"
                    disabled={mutation.pending}
                    onClick={() => remove(item.listingId)}
                  >
                    Bỏ khỏi giỏ
                  </button>
                </ItemRow>
              ))}
            </section>
            {summary}
          </div>
        )}
      </Resource>
    </>
  );
}
