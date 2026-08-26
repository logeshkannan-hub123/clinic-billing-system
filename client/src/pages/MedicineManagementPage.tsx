import { useId, useMemo, useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { ErrorState, LoadingState, getErrorMessage } from '../components/Feedback'
import { SelectField, TextField } from '../components/FormField'
import { PageHeader } from '../components/PageHeader'
import { SearchField } from '../components/SearchField'
import { useToast } from '../components/Toast'
import { useCurrentUser } from '../hooks/useAuth'
import {
  useCreateMedicine,
  useDeleteMedicine,
  useMedicines,
  useSetMedicineStatus,
  useUpdateMedicine,
} from '../hooks/useMedicines'
import {
  MEDICINE_CATEGORIES,
  MEDICINE_UNIT_TYPES,
  type Medicine,
  type MedicineCategory,
  type MedicineInput,
} from '../types/api'
import { paiseToRupeesInput, rupeesInputToPaise, sanitizeDecimalInput } from '../utils/money'

const CATEGORY_LABELS: Record<MedicineCategory, string> = {
  MEDICINE: 'Medicines',
  INJECTION: 'Injections',
  FLUID: 'Fluids',
}

function matchesSearch(medicine: Medicine, search: string): boolean {
  if (!search) return true
  const haystack = [medicine.name, medicine.brandName, medicine.genericName, medicine.composition]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(search.toLowerCase())
}

export function MedicineManagementPage() {
  const { data: user } = useCurrentUser()
  const isAdmin = user?.role === 'admin'

  const [category, setCategory] = useState<MedicineCategory>('MEDICINE')
  const [search, setSearch] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [editingTarget, setEditingTarget] = useState<Medicine | null>(null)
  const [togglingTarget, setTogglingTarget] = useState<Medicine | null>(null)
  const [deletingTarget, setDeletingTarget] = useState<Medicine | null>(null)

  const { data, isLoading, isError, error } = useMedicines({ category })
  const setStatus = useSetMedicineStatus()
  const deleteMedicine = useDeleteMedicine()

  const rows = useMemo(() => (data ?? []).filter((medicine) => matchesSearch(medicine, search)), [data, search])

  function startToggle(medicine: Medicine) {
    setStatus.reset()
    setTogglingTarget(medicine)
  }

  function cancelToggle() {
    setStatus.reset()
    setTogglingTarget(null)
  }

  function confirmToggle() {
    if (!togglingTarget) return
    setStatus.mutate(
      { id: togglingTarget._id, status: togglingTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
      { onSuccess: () => setTogglingTarget(null) },
    )
  }

  function startDelete(medicine: Medicine) {
    deleteMedicine.reset()
    setDeletingTarget(medicine)
  }

  function cancelDelete() {
    deleteMedicine.reset()
    setDeletingTarget(null)
  }

  function confirmDelete() {
    if (!deletingTarget) return
    deleteMedicine.mutate(deletingTarget._id, { onSuccess: () => setDeletingTarget(null) })
  }

  const columns: DataTableColumn<Medicine>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (m) => (
        <div>
          <div>{m.name}</div>
          <div className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
            {[m.brandName && m.brandName !== m.name ? m.brandName : null, m.genericName, m.strength]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      ),
    },
    { key: 'composition', header: 'Composition', render: (m) => m.composition },
    {
      key: 'unit',
      header: 'Unit',
      render: (m) => (m.volume && m.volumeUnit ? `${m.billingUnit} (${m.volume} ${m.volumeUnit})` : m.billingUnit),
    },
    {
      key: 'price',
      header: 'Price',
      render: (m) => (
        <div>
          <div>{formatRupees(m.sellingPriceInPaise)}</div>
          <div className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
            MRP {formatRupees(m.mrpInPaise)}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (m) => (
        <span className={`status-badge status-badge--${m.status === 'ACTIVE' ? 'paid' : 'cancelled'}`}>
          {m.status === 'ACTIVE' ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) =>
        isAdmin ? (
          <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
            <Button size="sm" variant="outlined" onClick={() => setEditingTarget(m)}>
              Edit
            </Button>
            <Button size="sm" variant={m.status === 'ACTIVE' ? 'destructive' : 'tonal'} onClick={() => startToggle(m)}>
              {m.status === 'ACTIVE' ? 'Disable' : 'Enable'}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => startDelete(m)}>
              Delete
            </Button>
          </div>
        ) : null,
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Medicine Management"
        subtitle="Manage the medicine, injection, and fluid catalog used in billing"
        actions={<Button onClick={() => setIsCreating(true)}>Add New</Button>}
      />

      <div className="toolbar">
        {MEDICINE_CATEGORIES.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={category === value ? 'filled' : 'outlined'}
            onClick={() => setCategory(value)}
          >
            {CATEGORY_LABELS[value]}
          </Button>
        ))}
        <div className="toolbar__spacer" />
        <SearchField label="Search medicines" value={search} onChange={setSearch} placeholder="Search medicines…" />
      </div>

      {isLoading && <LoadingState label="Loading medicines…" />}
      {isError && <ErrorState message={getErrorMessage(error, 'Could not load medicines')} />}

      {data && (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(m) => m._id}
          emptyMessage={`No ${CATEGORY_LABELS[category].toLowerCase()} yet — add the first one.`}
        />
      )}

      {isCreating && (
        <MedicineFormDialog mode="create" initialCategory={category} onClose={() => setIsCreating(false)} />
      )}

      {editingTarget && (
        <MedicineFormDialog mode="edit" medicine={editingTarget} onClose={() => setEditingTarget(null)} />
      )}

      {togglingTarget && (
        <ConfirmationDialog
          title={togglingTarget.status === 'ACTIVE' ? 'Disable this product?' : 'Enable this product?'}
          description={
            togglingTarget.status === 'ACTIVE'
              ? `${togglingTarget.name} will no longer appear in billing search. Existing bills that reference it are unaffected.`
              : `${togglingTarget.name} will become available in billing search again.`
          }
          confirmLabel={togglingTarget.status === 'ACTIVE' ? 'Disable' : 'Enable'}
          destructive={togglingTarget.status === 'ACTIVE'}
          loading={setStatus.isPending}
          error={
            setStatus.isError
              ? getErrorMessage(setStatus.error, 'Could not update this product. Please try again.')
              : undefined
          }
          onConfirm={confirmToggle}
          onCancel={cancelToggle}
        />
      )}

      {deletingTarget && (
        <ConfirmationDialog
          title="Delete this product?"
          description={`This permanently deletes ${deletingTarget.name}. This cannot be undone. If it has ever been used in a bill, the server will refuse and you'll need to Disable it instead.`}
          confirmLabel="Delete"
          destructive
          loading={deleteMedicine.isPending}
          error={
            deleteMedicine.isError
              ? getErrorMessage(deleteMedicine.error, 'Could not delete this product. Please try again.')
              : undefined
          }
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </div>
  )
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface MedicineFormDialogProps {
  onClose: () => void
  mode: 'create' | 'edit'
  medicine?: Medicine
  initialCategory?: MedicineCategory
}

function MedicineFormDialog({ onClose, mode, medicine, initialCategory }: MedicineFormDialogProps) {
  const titleId = useId()
  const categoryField = useId()
  const nameField = useId()
  const brandField = useId()
  const genericField = useId()
  const compositionField = useId()
  const strengthField = useId()
  const unitField = useId()
  const volumeField = useId()
  const volumeUnitField = useId()
  const mrpField = useId()
  const priceField = useId()

  const { showToast } = useToast()
  const create = useCreateMedicine()
  const update = useUpdateMedicine(medicine?._id ?? '')
  const isPending = mode === 'create' ? create.isPending : update.isPending
  const isError = mode === 'create' ? create.isError : update.isError
  const mutationError = mode === 'create' ? create.error : update.error

  const [category, setCategory] = useState<MedicineCategory>(medicine?.category ?? initialCategory ?? 'MEDICINE')
  const [name, setName] = useState(medicine?.name ?? '')
  const [brandName, setBrandName] = useState(medicine?.brandName ?? '')
  const [genericName, setGenericName] = useState(medicine?.genericName ?? '')
  const [composition, setComposition] = useState(medicine?.composition ?? '')
  const [strength, setStrength] = useState(medicine?.strength ?? '')
  const [billingUnit, setBillingUnit] = useState(medicine?.billingUnit ?? MEDICINE_UNIT_TYPES[0])
  const [volumeInput, setVolumeInput] = useState(medicine?.volume != null ? String(medicine.volume) : '')
  const [volumeUnit, setVolumeUnit] = useState(medicine?.volumeUnit ?? '')
  const [mrpInput, setMrpInput] = useState(medicine ? paiseToRupeesInput(medicine.mrpInPaise) : '')
  const [priceInput, setPriceInput] = useState(medicine ? paiseToRupeesInput(medicine.sellingPriceInPaise) : '')

  const isFluid = category === 'FLUID'
  const mrpInPaise = rupeesInputToPaise(mrpInput)
  const sellingPriceInPaise = rupeesInputToPaise(priceInput)
  const volume = volumeInput.trim() === '' ? null : Number(volumeInput)

  const canSubmit =
    name.trim().length > 0 &&
    genericName.trim().length > 0 &&
    composition.trim().length > 0 &&
    mrpInPaise !== null &&
    sellingPriceInPaise !== null &&
    (!isFluid || (volume !== null && volume > 0 && volumeUnit.trim().length > 0))

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || mrpInPaise === null || sellingPriceInPaise === null) return

    const input: MedicineInput = {
      category,
      name: name.trim(),
      brandName: brandName.trim() || null,
      genericName: genericName.trim(),
      composition: composition.trim(),
      strength: strength.trim() || null,
      billingUnit,
      volume: isFluid ? volume : null,
      volumeUnit: isFluid ? volumeUnit.trim() : null,
      mrpInPaise,
      sellingPriceInPaise,
    }

    const onSuccess = () => {
      showToast(mode === 'create' ? 'Medicine added.' : 'Medicine updated.', 'success')
      onClose()
    }
    if (mode === 'create') {
      create.mutate(input, { onSuccess })
    } else {
      update.mutate(input, { onSuccess })
    }
  }

  return (
    <Dialog titleId={titleId} title={mode === 'create' ? 'Add Medicine' : 'Edit Medicine'} onClose={onClose} wide>
      <form className="dialog__body" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <SelectField
            id={categoryField}
            label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value as MedicineCategory)}
          >
            {MEDICINE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </SelectField>
          <SelectField
            id={unitField}
            label="Billing unit"
            value={billingUnit}
            onChange={(event) => setBillingUnit(event.target.value)}
          >
            {MEDICINE_UNIT_TYPES.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </SelectField>
        </div>

        <TextField id={nameField} label="Product name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />

        <div className="form-grid">
          <TextField
            id={brandField}
            label="Brand name"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            hint="Optional — leave blank for a generic/unbranded product"
          />
          <TextField id={genericField} label="Generic name" value={genericName} onChange={(e) => setGenericName(e.target.value)} required />
        </div>

        <div className="form-grid">
          <TextField id={compositionField} label="Composition" value={composition} onChange={(e) => setComposition(e.target.value)} required />
          <TextField id={strengthField} label="Strength" value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="e.g. 500 mg" />
        </div>

        {isFluid && (
          <div className="form-grid">
            <TextField
              id={volumeField}
              label="Volume"
              inputMode="decimal"
              value={volumeInput}
              onChange={(e) => setVolumeInput(sanitizeDecimalInput(e.target.value))}
              required
            />
            <TextField
              id={volumeUnitField}
              label="Volume unit"
              value={volumeUnit}
              onChange={(e) => setVolumeUnit(e.target.value)}
              placeholder="e.g. ml"
              required
            />
          </div>
        )}

        <div className="form-grid">
          <TextField
            id={mrpField}
            label="MRP (₹)"
            inputMode="decimal"
            value={mrpInput}
            onChange={(e) => setMrpInput(sanitizeDecimalInput(e.target.value))}
            required
          />
          <TextField
            id={priceField}
            label="Selling price (₹)"
            inputMode="decimal"
            value={priceInput}
            onChange={(e) => setPriceInput(sanitizeDecimalInput(e.target.value))}
            required
          />
        </div>

        {isError && (
          <p className="inline-error" role="alert">
            {getErrorMessage(mutationError, 'Could not save this medicine.')}
          </p>
        )}

        <div className="dialog__actions">
          <Button type="button" variant="outlined" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={isPending} disabled={!canSubmit}>
            {mode === 'create' ? 'Add Medicine' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
