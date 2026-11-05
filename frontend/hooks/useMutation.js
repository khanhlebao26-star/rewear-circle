"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api.mjs";

export function useMutation() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const request = useRef(null);
  const busy = useRef(false);
  async function run(path, body = {}, method = "POST") {
    if (busy.current) return null;
    busy.current = true;
    setPending(true);
    setError(null);
    setMessage("");
    const fingerprint = JSON.stringify([path, method, body]);
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await api(path, {
        method,
        body,
        key: request.current.key,
      });
      request.current = null;
      return result;
    } catch (failure) {
      setError(failure);
      return null;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return { run, pending, error, message, setMessage, setError };
}
