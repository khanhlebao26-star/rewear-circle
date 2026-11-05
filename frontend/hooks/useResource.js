"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api.mjs";

export default function useResource(path) {
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
    setResource({
      path,
      revision,
      data: null,
      meta: {},
      loading: true,
      error: null,
    });
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
  }, [path, revision]);
  return {
    ...(resource.path === path && resource.revision === revision
      ? resource
      : { data: null, meta: {}, loading: Boolean(path), error: null }),
    reload: () => setRevision((value) => value + 1),
  };
}
