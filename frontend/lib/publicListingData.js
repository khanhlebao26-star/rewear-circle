const apiUpstream = process.env.API_UPSTREAM || "http://localhost:4000";

export async function getPublicListingData(path) {
  try {
    const response = await fetch(`${apiUpstream}/api/v1${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    if (response.ok) return { data: result.data };
    return {
      error: {
        status: response.status,
        code: result.error?.code,
        message: result.error?.message || "Không thể tải tin đăng. Vui lòng thử lại.",
      },
    };
  } catch {
    return { error: { message: "Không thể tải tin đăng. Vui lòng thử lại." } };
  }
}
