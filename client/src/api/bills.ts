import { apiClient } from './client'
import type {
  Bill,
  BillInput,
  BillListResult,
  BillWithPayments,
  PreviewBillInput,
  PreviewBillResult,
  RecordPaymentInput,
  RecordPaymentResult,
} from '../types/api'

export interface ListBillsParams {
  status?: string
  date?: string
  search?: string
  limit?: number
  skip?: number
}

function toQueryString(params: ListBillsParams): string {
  const search = new URLSearchParams()
  if (params.status) search.set('status', params.status)
  if (params.date) search.set('date', params.date)
  if (params.search) search.set('search', params.search)
  if (params.limit !== undefined) search.set('limit', String(params.limit))
  if (params.skip !== undefined) search.set('skip', String(params.skip))
  const query = search.toString()
  return query ? `?${query}` : ''
}

export function previewBill(input: PreviewBillInput): Promise<PreviewBillResult> {
  return apiClient.post<PreviewBillResult>('/bills/preview', input)
}

export function createBill(
  input: BillInput,
  confirmDuplicate?: boolean,
  idempotencyKey?: string,
): Promise<Bill> {
  return apiClient.post<Bill>('/bills', { ...input, confirmDuplicate, idempotencyKey })
}

export function editBill(id: string, input: BillInput): Promise<Bill> {
  return apiClient.patch<Bill>(`/bills/${id}`, input)
}

export function cancelBill(id: string): Promise<Bill> {
  return apiClient.patch<Bill>(`/bills/${id}/cancel`)
}

export function listBills(params: ListBillsParams = {}): Promise<BillListResult> {
  return apiClient.get<BillListResult>(`/bills${toQueryString(params)}`)
}

export function getBill(id: string): Promise<BillWithPayments> {
  return apiClient.get<BillWithPayments>(`/bills/${id}`)
}

export function recordPayment(id: string, input: RecordPaymentInput): Promise<RecordPaymentResult> {
  return apiClient.post<RecordPaymentResult>(`/bills/${id}/payments`, input)
}
