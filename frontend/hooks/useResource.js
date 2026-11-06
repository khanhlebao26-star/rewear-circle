"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api.mjs";

export default function useResource(path, { keepDataOnReload = false } = {}) {
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState({
    path: null,
    revision: -1,
    data: null,
    meta: {},
    loading: Boolean(path),
    error: null,
  });
  useEffect(() => {
    if (!path) {
      setResource({
        path,
        revision,
        data: null,
        meta: {},
        loading: false,
        error: null,
      });
      return;
    }
    const controller = new AbortController();
    setResource((previous) => ({
      path,
      revision,
      data: keepDataOnReload && previous.path === path ? previous.data : null,
      meta: keepDataOnReload && previous.path === path ? previous.meta : {},
      loading: true,
      error: null,
    }));
    api(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted)
          setResource({
            path,
            revision,
            data: result.data,
            meta: result.meta || {},
            loading: false,
            error: null,
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResource({
            path,
            revision,
            data: null,
            meta: {},
            loading: false,
            error,
          });
      });
    return () => controller.abort();
  }, [path, revision, keepDataOnReload]);
  const samePath = resource.path === path;
  const settled = samePath && resource.revision === revision && !resource.loading;
  const refreshing = keepDataOnReload && samePath && resource.data != null && !settled;
  return {
    data: settled || refreshing ? resource.data : null,
    meta: settled || refreshing ? resource.meta : {},
    error: settled ? resource.error : null,
    loading: Boolean(path) && !settled && !refreshing,
    refreshing,
    reload: () => setRevision((value) => value + 1),
  };
}
