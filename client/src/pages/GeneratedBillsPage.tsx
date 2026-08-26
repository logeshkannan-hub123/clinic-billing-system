import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CurrencyDisplay } from '../components/CurrencyDisplay'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { ErrorState, LoadingState, getErrorMessage } from '../components/Feedback'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { SearchField } from '../components/SearchField'
import { StatusBadge } from '../components/StatusBadge'
import { useBillsList } from '../hooks/useBills'
import type { BillListItem, BillStatus } from '../types/api'
import { formatDateTimeIst } from '../utils/datetime'

const PAGE_SIZE = 50

type ViewFilter = 'active' | 'all' | BillStatus

const VIEW_LABELS: Record<ViewFilter, string> = {
  active: 'Active (Unpaid + Partial)',
  all: 'All statuses',
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
}

const ACTIVE_STATUSES: BillStatus[] = ['UNPAID', 'PARTIALLY_PAID']

export function GeneratedBillsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlStatus = searchParams.get('status') as BillStatus | null
  const urlDate = searchParams.get('date')
  const urlView = searchParams.get('view')

  const [view, setView] = useState<ViewFilter>(urlView === 'all' ? 'all' : (urlStatus ?? 'active'))
  const [search, setSearch] = useState('')
  const [date, setDate] = useState(urlDate ?? '')
  const [page, setPage] = useState(0)

  const serverStatus = view === 'active' || view === 'all' ? undefined : view

  // Any change to what's actually being listed invalidates the current
  // page — e.g. page 3 of an unfiltered search may not exist at all once a
  // status filter narrows the result set.
  useEffect(() => {
    setPage(0)
  }, [view, search, date])

  const { data, isLoading, isError, error } = useBillsList({
    status: serverStatus,
    date: date || undefined,
    search: search || undefined,
    limit: PAGE_SIZE,
    skip: page * PAGE_SIZE,
  })

  // Pre-existing behavior, unchanged by pagination: "Active" isn't a real
  // server-side status (it's UNPAID + PARTIALLY_PAID combined), so this
  // filter runs client-side on whatever page the server already returned —
  // a page can show fewer than PAGE_SIZE rows in that view if some of the
  // fetched bills are PAID/CANCELLED. `data.total`/pagination controls still
  // reflect the server's unfiltered count for that reason.
  const bills = useMemo(() => {
    if (!data) return []
    if (view === 'active') {
      return data.bills.filter((bill) => ACTIVE_STATUSES.includes(bill.status))
    }
    return data.bills
  }, [data, view])

  function updateView(next: ViewFilter) {
    setView(next)
    const params = new URLSearchParams(searchParams)
    params.delete('status')
    params.delete('view')
    if (next === 'all') {
      params.set('view', 'all')
    } else if (next !== 'active') {
      params.set('status', next)
    }
    setSearchParams(params, { replace: true })
  }

  const columns: DataTableColumn<BillListItem>[] = [
    { key: 'billNumber', header: 'Bill #', render: (bill) => bill.billNumber },
    { key: 'patientName', header: 'Patient', render: (bill) => bill.patientName },
    { key: 'patientPhone', header: 'Phone', render: (bill) => bill.patientPhone },
    { key: 'issuedAt', header: 'Date & Time', render: (bill) => formatDateTimeIst(bill.issuedAt) },
    {
      key: 'grandTotalInPaise',
      header: 'Total',
      align: 'right',
      render: (bill) => <CurrencyDisplay paise={bill.grandTotalInPaise} size="sm" />,
    },
    {
      key: 'dueAmountInPaise',
      header: 'Due',
      align: 'right',
      render: (bill) =>
        bill.status === 'UNPAID' || bill.status === 'PARTIALLY_PAID' ? (
          <CurrencyDisplay paise={bill.dueAmountInPaise} size="sm" tone="due" />
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: 'status', header: 'Status', render: (bill) => <StatusBadge status={bill.status} /> },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Generated Bills"
        subtitle="Unpaid and partially paid bills by default — search to find any historical bill"
        actions={<Button onClick={() => navigate('/bills/new')}>New Bill</Button>}
      />

      <div className="toolbar">
        <SearchField label="Search by patient name or phone" value={search} onChange={setSearch} placeholder="Search name or phone…" />
        <input type="date" className="input" style={{ width: 170 }} value={date} onChange={(event) => setDate(event.target.value)} />
        <select className="select" style={{ width: 220 }} value={view} onChange={(event) => updateView(event.target.value as ViewFilter)}>
          {(Object.keys(VIEW_LABELS) as ViewFilter[]).map((key) => (
            <option key={key} value={key}>
              {VIEW_LABELS[key]}
            </option>
          ))}
        </select>
        <div className="toolbar__spacer" />
      </div>

      {isLoading && <LoadingState label="Loading bills…" />}
      {isError && <ErrorState message={getErrorMessage(error, 'Could not load bills')} />}

      {data && (
        <>
          <DataTable
            columns={columns}
            rows={bills}
            getRowKey={(bill) => bill._id}
            onRowClick={(bill) => navigate(`/bills/${bill._id}`)}
            emptyMessage={
              view === 'active'
                ? 'No unpaid or partially paid bills right now.'
                : 'No bills match this filter.'
            }
          />
          {data.total > PAGE_SIZE && (
            <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
              <span className="text-muted">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total}
              </span>
              <Button variant="outlined" size="sm" onClick={() => setPage((p) => Math.max(p - 1, 0))} disabled={page === 0}>
                Previous
              </Button>
              <Button
                variant="outlined"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= data.total}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
