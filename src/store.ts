import { useCallback, useEffect, useState } from 'react'
import type { ApiResult } from './api'
import type { StoredResult } from './checks'

export function usePersistent<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* quota or private mode: keep in memory only */
    }
  }, [key, value])
  return [value, useCallback((v) => setValue(v), [])]
}

export interface ReportMeta {
  title: string
  preparedBy: string
  audience: string
  summary: string
}

export type History = ApiResult[]
export type Results = Record<string, StoredResult>

export const DEFAULT_META: ReportMeta = {
  title: 'NIPOST Postcode API: Integration Assessment',
  preparedBy: '',
  audience: 'Engineering & product stakeholders',
  summary: '',
}
