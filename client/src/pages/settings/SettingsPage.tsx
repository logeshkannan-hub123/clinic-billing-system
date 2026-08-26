import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { PageHeader } from '../../components/PageHeader'
import { SettingsNav } from '../../components/SettingsNav'
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard'

/** Shared with every section via `useOutletContext` — each section reports
 * its own dirty state up so the nav (and the tab-close guard) know whether
 * to protect against accidental navigation. Only one section is ever
 * mounted at a time, so there's no cross-section state to reconcile. */
export interface SettingsSectionContext {
  isDirty: boolean
  setDirty: (dirty: boolean) => void
}

/** Layout shell: section nav + content outlet, mirroring AppLayout's own
 * sidebar + content shape. */
export function SettingsPage() {
  const [isDirty, setDirty] = useState(false)
  const { confirmNavigation } = useUnsavedChangesGuard(isDirty)

  return (
    <div className="page settings-page">
      <PageHeader title="Settings" subtitle="Configure how this clinic's billing workspace behaves" />
      <div className="settings-layout">
        <SettingsNav isDirty={isDirty} confirmNavigation={confirmNavigation} />
        <div className="settings-content">
          <Outlet context={{ isDirty, setDirty } satisfies SettingsSectionContext} />
        </div>
      </div>
    </div>
  )
}
