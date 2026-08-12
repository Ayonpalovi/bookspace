import { useCallback, useEffect, useRef, useState } from 'react'

interface AsyncState<T> {
  data: T | undefined
  loading: boolean
  error: Error | null
}

/**
 * Runs an async loader and re-runs it when `deps` change or `reload()` is
 * called. Results from stale runs are discarded so a slow request can't
 * overwrite a newer one.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[],
): AsyncState<T> & { reload: () => void; setData: (value: T) => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: undefined,
    loading: true,
    error: null,
  })
  const [nonce, setNonce] = useState(0)
  const runId = useRef(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    const id = ++runId.current
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))
    loaderRef
      .current()
      .then((data) => {
        if (cancelled || id !== runId.current) return
        setState({ data, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled || id !== runId.current) return
        setState({
          data: undefined,
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const setData = useCallback(
    (value: T) => setState({ data: value, loading: false, error: null }),
    [],
  )

  return { ...state, reload, setData }
}
