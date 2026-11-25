'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { ENQUIRY_TYPES } from '@/lib/lead-fields'
import {
  IMPORT_COLUMNS, IMPORT_MAX_ROWS, cellText, mapHeaders, validateImportRow, type ImportLists, type ImportRow,
} from '@/lib/lead-import'
import { getImportLists, importLeadsChunk, type ImportRowResult } from '../import-actions'

const CHUNK = 300

/**
 * Leads → Import (REQ-101). Excel (.xlsx) only.
 * 1. Download the template (every lead column, dropdowns for Source/Status/Project/Enquiry Type)
 * 2. Upload the filled file → preview with problems per row
 * 3. Import (server re-checks every row; numbers already in the CRM are skipped)
 */
export default function ImportLeadsModal({ onClose, onImported }: { onClose: () => void; onImported: (count: number) => void }) {
  const [lists, setLists] = useState<ImportLists | null>(null)
  const [listsError, setListsError] = useState('')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [fileError, setFileError] = useState('')
  const [busy, setBusy] = useState<null | 'template' | 'reading' | 'importing'>(null)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<ImportRowResult[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getImportLists().then((res) => (res.error ? setListsError(res.error) : setLists(res))).catch(() => setListsError('Could not load the CRM lists.'))
  }, [])

  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && busy !== 'importing') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = orig; window.removeEventListener('keydown', onKey) }
  }, [onClose, busy])

  const preview = useMemo(
    () => (rows && lists ? rows.map((r) => ({ r, check: validateImportRow(r, lists) })) : null),
    [rows, lists]
  )
  const readyCount = preview ? preview.filter((p) => !('errors' in p.check)).length : 0
  const problemRows = preview ? preview.filter((p) => 'errors' in p.check) : []

  const downloadTemplate = async () => {
    if (!lists) return
    setBusy('template')
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Leads', { views: [{ state: 'frozen', ySplit: 1 }] })
      ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.required ? `${c.header} *` : c.header, key: c.key, width: c.key === 'notes' ? 40 : 22 }))
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1D33' } }
      ws.getColumn('phone').numFmt = '@' // keep +91 / leading zeros as typed
      ws.getColumn('date').numFmt = 'dd/mm/yyyy'

      // Hidden sheet with the CRM's lists → dropdowns in the Leads sheet
      const listSheet = wb.addWorksheet('Lists', { state: 'hidden' })
      const cols: [string, string[]][] = [
        ['Source', lists.sources.map((s) => s.name)],
        ['Status', lists.statuses.map((s) => s.name)],
        ['Project', lists.projects.map((p) => p.name)],
        ['Enquiry Type', lists.enquiryTypes?.length ? lists.enquiryTypes : [...ENQUIRY_TYPES]],
      ]
      cols.forEach(([title, values], i) => {
        const col = listSheet.getColumn(i + 1)
        col.values = [title, ...values]
      })
      const letter = (key: string) => String.fromCharCode(65 + IMPORT_COLUMNS.findIndex((c) => c.key === key))
      const dropdowns: [string, number, number][] = [['source', 1, lists.sources.length], ['status', 2, lists.statuses.length], ['project', 3, lists.projects.length], ['enquiry_type', 4, (lists.enquiryTypes?.length || ENQUIRY_TYPES.length)]]
      for (const [key, listCol, count] of dropdowns) {
        if (!count) continue
        const L = String.fromCharCode(64 + listCol)
        for (let r = 2; r <= IMPORT_MAX_ROWS + 1; r++) {
          ws.getCell(`${letter(key)}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Lists!$${L}$2:$${L}$${count + 1}`] }
        }
      }

      const help = wb.addWorksheet('How to fill')
      help.columns = [{ header: 'Column', key: 'c', width: 18 }, { header: 'Required', key: 'r', width: 10 }, { header: 'What to enter', key: 'w', width: 60 }]
      help.getRow(1).font = { bold: true }
      IMPORT_COLUMNS.forEach((c) => help.addRow({ c: c.header, r: c.required ? 'Yes' : 'No', w: c.help }))
      help.addRow({})
      help.addRow({ c: 'Note', w: `Up to ${IMPORT_MAX_ROWS} rows. A number already in the CRM is skipped (one lead per person).` })

      const buf = await wb.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'leads-import-template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Could not create the template.')
    } finally {
      setBusy(null)
    }
  }

  const readFile = async (file: File | undefined) => {
    setFileError('')
    setRows(null)
    setResults(null)
    if (!file) return
    setFileName(file.name)
    if (!/\.xlsx$/i.test(file.name)) { setFileError('Please choose an Excel file (.xlsx). Other formats are not accepted.'); return }
    if (file.size > 5 * 1024 * 1024) { setFileError('The file is larger than 5 MB.'); return }
    setBusy('reading')
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.getWorksheet('Leads') || wb.worksheets.find((w) => w.state !== 'hidden') || wb.worksheets[0]
      if (!ws) { setFileError('The file has no sheets.'); return }

      const headerRow = ws.getRow(1)
      const headers: string[] = []
      for (let c = 1; c <= ws.columnCount; c++) headers.push(cellText(headerRow.getCell(c).value).replace(/\*/g, ''))
      const map = mapHeaders(headers)
      const mapped = Object.values(map)
      if (!mapped.includes('name') || !mapped.includes('phone')) {
        setFileError('Could not find the Name and Phone columns. Please use the template.')
        return
      }

      const parsed: ImportRow[] = []
      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return
        const r: ImportRow = { row: rowNumber }
        let any = false
        Object.entries(map).forEach(([idx, field]) => {
          const text = cellText(row.getCell(Number(idx) + 1).value)
          if (text) { r[field!] = text; any = true }
        })
        if (any) parsed.push(r)
      })
      if (parsed.length === 0) { setFileError('No leads found in the file.'); return }
      if (parsed.length > IMPORT_MAX_ROWS) { setFileError(`The file has ${parsed.length} rows. Up to ${IMPORT_MAX_ROWS} can be imported at a time.`); return }
      setRows(parsed)
    } catch {
      setFileError('Could not read this file. Please save it as .xlsx from Excel or Google Sheets and try again.')
    } finally {
      setBusy(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const runImport = async () => {
    if (!rows) return
    setBusy('importing')
    setProgress(0)
    const all: ImportRowResult[] = []
    let seen: string[] = []
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const res = await importLeadsChunk(rows.slice(i, i + CHUNK), seen)
        if (res.error) { toast.error('Import stopped', { description: res.error }); break }
        all.push(...res.results)
        seen = res.seen
        setProgress(Math.min(rows.length, i + CHUNK))
      }
    } catch {
      toast.error('Import stopped. Please try again.')
    } finally {
      setResults(all)
      setBusy(null)
      const imported = all.filter((r) => r.status === 'imported').length
      if (imported > 0) onImported(imported)
    }
  }

  const counts = results && {
    imported: results.filter((r) => r.status === 'imported').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: results.filter((r) => r.status === 'error').length,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0f1d33]/50 sm:p-4" onClick={() => busy !== 'importing' && onClose()}>
      <div className="flex w-full sm:max-w-2xl max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Import leads">
        <div className="flex items-center justify-between border-b border-[#e8ecf2] px-4 py-3 sm:px-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[#0f1d33]"><FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Import leads (Excel)</h2>
          <button onClick={onClose} disabled={busy === 'importing'} className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#f3f5f8] cursor-pointer" aria-label="Close"><X className="h-5 w-5 text-[#5a6a82]" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {listsError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{listsError}</p>}

          {/* Step 1 */}
          <section>
            <h3 className="text-sm font-bold text-[#0f1d33]">1. Download the template</h3>
            <p className="mt-1 text-xs text-[#5a6a82]">It has every lead column, with dropdowns for Source, Status, Project and Enquiry Type from this CRM. Name, Phone and Source are required.</p>
            <button type="button" onClick={downloadTemplate} disabled={!lists || !!busy}
              className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#e8ecf2] bg-white px-4 text-sm font-semibold text-[#0f1d33] hover:bg-[#f3f5f8] disabled:opacity-60 cursor-pointer">
              {busy === 'template' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download Excel template
            </button>
          </section>

          {/* Step 2 */}
          <section>
            <h3 className="text-sm font-bold text-[#0f1d33]">2. Upload the filled file (.xlsx)</h3>
            <label className="mt-2 flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#d0d7e2] bg-[#f8fafc] p-4 text-center hover:border-[#1e3a5f]">
              {busy === 'reading' ? <Loader2 className="h-5 w-5 animate-spin text-[#5a6a82]" /> : <Upload className="h-5 w-5 text-[#5a6a82]" />}
              <span className="text-sm font-semibold text-[#0f1d33]">{fileName || 'Choose an Excel file'}</span>
              <span className="text-xs text-[#8a99ad]">Excel (.xlsx) only, up to {IMPORT_MAX_ROWS} rows</span>
              <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
                disabled={!lists || !!busy} onChange={(e) => readFile(e.target.files?.[0])} />
            </label>
            {fileError && <p className="mt-2 text-sm font-semibold text-red-600" role="alert">{fileError}</p>}
          </section>

          {/* Step 3: preview / results */}
          {preview && !results && (
            <section>
              <h3 className="text-sm font-bold text-[#0f1d33]">3. Check and import</h3>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{readyCount} ready</span>
                {problemRows.length > 0 && <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">{problemRows.length} with problems (will be skipped)</span>}
              </div>
              {problemRows.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-red-100 bg-red-50/50 p-2 text-xs text-red-800">
                  {problemRows.slice(0, 100).map(({ r, check }) => (
                    <li key={r.row}><strong>Row {r.row}</strong>{r.name ? ` (${r.name})` : ''}: {'errors' in check ? check.errors.join('; ') : ''}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-[#5a6a82]">Numbers already in the CRM are skipped, so nobody is added twice.</p>
              <button type="button" onClick={runImport} disabled={busy === 'importing' || readyCount === 0}
                className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#0f1d33] px-4 text-sm font-semibold text-white hover:bg-[#1e3a5f] disabled:opacity-60 cursor-pointer sm:w-auto">
                {busy === 'importing' ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing {progress}/{rows!.length}...</> : <>Import {readyCount} lead{readyCount === 1 ? '' : 's'}</>}
              </button>
            </section>
          )}

          {counts && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-[#0f1d33]">Done</h3>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {counts.imported} imported</span>
                {counts.skipped > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{counts.skipped} skipped (already in the CRM or repeated)</span>}
                {counts.errors > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> {counts.errors} with problems</span>}
              </div>
              {results!.some((r) => r.status !== 'imported') && (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[#e8ecf2] p-2 text-xs text-[#334155]">
                  {results!.filter((r) => r.status !== 'imported').slice(0, 200).map((r) => (
                    <li key={r.row}><strong>Row {r.row}</strong>: {r.message}</li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={onClose} className="inline-flex min-h-[44px] items-center rounded-lg bg-[#0f1d33] px-4 text-sm font-semibold text-white hover:bg-[#1e3a5f] cursor-pointer">Close</button>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
