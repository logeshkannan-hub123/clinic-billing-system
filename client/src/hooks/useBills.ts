import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelBill,
  createBill,
  editBill,
  getBill,
  listBills,
  previewBill,
  recordPayment,
  type ListBillsParams,
} from '../api/bills'
import { queryKeys } from '../api/queryKeys'
import type { BillInput, PreviewBillInput, RecordPaymentInput } from '../types/api'

export function useBillsList(params: ListBillsParams) {
  return useQuery({
    queryKey: queryKeys.bills(params),
    queryFn: () => listBills(params),
  })
}

export function useBill(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.bill(id ?? ''),
    queryFn: () => getBill(id as string),
    enabled: Boolean(id),
  })
}

/** Mutation, not a query — deliberately not cached: every keystroke-driven
 * preview call should hit the server fresh (the whole point is it reflects
 * the exact current tax config / current inputs), and it never persists
 * anything, so there's no server state here worth caching. */
export function useBillPreview() {
  return useMutation({
    mutationFn: (input: PreviewBillInput) => previewBill(input),
  })
}

export function useCreateBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      input,
      confirmDuplicate,
      idempotencyKey,
    }: {
      input: BillInput
      confirmDuplicate?: boolean
      idempotencyKey?: string
    }) => createBill(input, confirmDuplicate, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useEditBill(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BillInput) => editBill(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bill(id) })
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      // Consistent with create/cancel/payment — an edit can change a bill's
      // grandTotalInPaise, and the dashboard's revenue/pending figures are
      // derived from exactly that, so it needs to stay in sync too.
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useCancelBill(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => cancelBill(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bill(id) })
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useRecordPayment(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RecordPaymentInput) => recordPayment(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bill(id) })
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
