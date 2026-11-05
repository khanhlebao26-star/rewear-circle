"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/layout/AppShell";
import useResource from "@/hooks/useResource";
import { useMutation } from "@/hooks/useMutation";
import { Empty, ErrorState, Loading } from "@/components/ui/Feedback";
import { Heading, Pager } from "@/components/ui/PageNavigation";
import { Icon } from "@/components/ui/Icon";
import { date } from "@/lib/api.mjs";
import { notificationTarget } from "@/lib/routes.mjs";

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const resource = useResource(`/me/notifications?page=${page}&limit=20`);
  const session = useSession();
  const { syncUnread } = session;
  const mutation = useMutation();
  const unread = resource.meta.unread;
  useEffect(() => {
    if (unread !== undefined) syncUnread(unread);
  }, [unread, syncUnread]);
  const target = (note) => notificationTarget(note, session.user.role);
  async function read(id) {
    if (await mutation.run(`/me/notifications/${id}/read`, {}, "PATCH")) {
      resource.reload();
    }
  }
  return (
    <>
      <Heading
        eyebrow="CẬP NHẬT CỦA BẠN"
        title="Thông báo"
        description={`${resource.meta.unread || 0} thông báo chưa đọc.`}
      />
      {mutation.error && <ErrorState error={mutation.error} />}
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorState error={resource.error} reload={resource.reload} />
      ) : resource.data?.length ? (
        <>
          <div className="panel">
            {resource.data.map((note) => (
              <article
                className={`notification-row ${note.readAt ? "" : "unread"}`}
                key={note.notificationId}
              >
                <span className="notification-icon">
                  <Icon name="bell" />
                </span>
                <div className="grow">
                  <p>{note.message}</p>
                  {note.reason && <p>{note.reason}</p>}
                  <small>{date(note.createdAt)}</small>
                  <div className="row mt">
                    {target(note) && (
                      <Link className="link" href={target(note)}>
                        Xem chi tiết
                      </Link>
                    )}
                    {!note.readAt && (
                      <button
                        className="link"
                        disabled={mutation.pending}
                        onClick={() => read(note.notificationId)}
                      >
                        Đánh dấu đã đọc
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <Pager meta={resource.meta} page={page} onPage={setPage} />
        </>
      ) : (
        <Empty title="Chưa có thông báo." icon="bell">
          Những cập nhật dành cho bạn sẽ xuất hiện tại đây.
        </Empty>
      )}
    </>
  );
}
