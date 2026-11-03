# Week 1 Docker discovery acceptance

Recorded: 2026-10-31 08:30 +07:00<br>
Plan: [Week 1 Nhung Docker discovery plan](week1-nhung-docker-discovery-plan.md)
Result: Step F passed against the Docker demo runtime and isolated `_test` replica set.

## Contract and authorization

- Existing `GET /api/v1/listings` and `GET /api/v1/listings/:id` are the only public DISC routes. `backend/src/routes/listings.js` does not add duplicate GET handlers for `/listings` or `/listings/:id`.
- Guest feed requests without filters are public. Adding search/filter parameters requires an authenticated session; unauthenticated requests return `401 UNAUTHORIZED`.
- Invalid query shape, unsupported category/size combinations, out-of-range prices, reversed price ranges, and limits over 100 return `422 VALIDATION_ERROR`.
- Feed uses page 1 and limit 20 by default, accepts limit 100, sorts by `createdAt DESC, _id DESC`, and returns the filtered `total`.
- Search and filters use only the selected `approvedVersionId` when its status is `APPROVED`.
- Seller-hidden, admin-hidden, review-held, correction-requested, payment-review-held, pending-only, and wrong-approved-pointer fixtures are absent from feed and return 404 from public detail. Their images are not public either.
- RESERVED and SOLD are absent from feed but remain viewable by direct detail URL with `canBuy: false`; SOLD includes `watermark: "Đã bán"`.
- Feed/detail DTO checks show no reviewer/private moderation notes, owner model fields, or user email. Public approved listing media returns 200; hidden listing media returns 404.

## Frontend

The home page loads the backend feed through Next.js `/api/v1` rewrites. It has search, category, size, condition, and price filters; a visible sign-in form for the filter authorization boundary; pagination; loading skeletons; request-error recovery; and an empty result state. Detail pages load by listing ID, show availability and SOLD watermark, and fall back to a designed placeholder if the image is missing or a 1×1 seed pixel.

The UI was checked in a browser against `http://localhost:3001`: the guest feed rendered the 3 available demo items; a guest filter request showed the sign-in prompt; signing in with a demo account returned filtered feed data; the detail view rendered backend fields; a no-match search showed the empty state; and the SOLD demo URL showed the “Đã bán” watermark and unavailable status. The existing HTTP session and Origin checks remained in place through the rewrite.

The UI's network-error view is implemented but was not forced by taking down the backend. The tested empty state covers a successful response with no matches.

## Test results

Command:

```sh
docker compose --profile test run --build --rm test-runner
```

Result: **17 tests passed, 0 failed, 0 skipped across 7 serial suites**, including the new `backend/test/discovery-flow.test.js`. It runs on the isolated Compose MongoDB replica set and a database ending in `_test`; fixtures validate guest/auth filters, each filter and combinations, regex escaping, pagination and tie ordering, approved revisions, visibility gates, detail DTOs, and public/private image access.

Frontend production build passed with routes `/`, `/_not-found`, and `/listings/[id]`. The rebuilt frontend container is healthy at `http://localhost:3001`; the backend, MongoDB, and Mailpit demo services remain healthy. The previous local API and VNPAY worker remain untouched. No migration or retention apply was run.
