import ExcelJS from 'exceljs'

/** The database returns at most 1000 rows per request, so leads are read page by page. */
const PAGE = 1000
const MAX_ROWS = 20000

const ist = (d: string) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })

/** The Excel file behind a report: every lead created in the window. Server only. */
export async function buildReportWorkbook(db: any, start: Date, end: Date, master = false): Promise<Buffer> {
  const rows: any[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let q = db.from('leads').select('name, phone, email, project, source_page, status, created_at').lte('created_at', end.toISOString())
    if (!master) q = q.gte('created_at', start.toISOString())
    const { data, error } = await q.order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  const [statusRes, sourceRes] = await Promise.all([
    db.from('lead_statuses').select('key, name'),
    db.from('lead_sources').select('key, name'),
  ])
  const status = new Map<string, string>((statusRes.data || []).map((s: any) => [String(s.key).toLowerCase(), s.name]))
  const source = new Map<string, string>((sourceRes.data || []).map((s: any) => [String(s.key).toLowerCase(), s.name]))

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(master ? 'Master report' : 'Leads')
  ws.columns = [
    { header: 'Sr. No', key: 'n', width: 8 }, { header: 'Date (IST)', key: 'at', width: 22 }, { header: 'Name', key: 'name', width: 26 },
    { header: 'Phone', key: 'phone', width: 18 }, { header: 'Email', key: 'email', width: 30 }, { header: 'Project', key: 'project', width: 28 },
    { header: 'Source', key: 'source', width: 16 }, { header: 'Status', key: 'status', width: 16 },
  ]
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  // Cells that start with = + - @ are text, never formulas (a lead's name must not run as a formula in Excel)
  const safe = (v: unknown) => { const t = String(v ?? ''); return /^[=+\-@]/.test(t) ? `'${t}` : t }
  ;rows.forEach((l: any, i: number) => ws.addRow({
    n: i + 1, at: ist(l.created_at), name: safe(l.name), phone: safe(l.phone), email: safe(l.email), project: safe(l.project),
    source: source.get(String(l.source_page || '').toLowerCase()) || safe(l.source_page), status: status.get(String(l.status || 'new').toLowerCase()) || safe(l.status),
  }))
  return Buffer.from(await wb.xlsx.writeBuffer())
}
