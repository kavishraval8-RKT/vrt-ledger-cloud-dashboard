import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarDays,
  Download,
  ExternalLink,
  FileUp,
  LogOut,
  Mail,
  Receipt,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { RECEIPTS_BUCKET, isSupabaseConfigured, supabase } from './lib/supabaseClient'

const USER_DIRECTORY = {
  'admin@club.com': { role: 'admin', label: 'Admin' },
  'treasurer@club.com': { role: 'treasurer', label: 'Treasurer' },
  'member@club.com': { role: 'member', label: 'Member' },
  'events@club.com': { role: 'member', label: 'Member' },
}

const PRIVILEGED_ROLES = new Set(['admin', 'treasurer'])

const QUANTITY_UNITS = ['NOS', 'KG']
const CATEGORIES = ['Avionics', 'Propulsion', 'Recovery', 'Structure', 'Miscellaneous']
const CATEGORY_COLORS = {
  Avionics: '#2563eb',
  Propulsion: '#ef4444',
  Recovery: '#10b981',
  Structure: '#f59e0b',
  Miscellaneous: '#8b5cf6',
}
const ALLOWED_RECEIPT_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp'])
const ALLOWED_RECEIPT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
])

const initialForm = {
  itemName: '',
  amount: '',
  quantity: '',
  quantityUnit: 'NOS',
  purchaseDate: '',
  category: '',
  miscDescription: '',
  proofFileName: '',
  proofFile: null,
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

function getTodayIsoDate() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeExpenseRecord(row) {
  return {
    id: row.id,
    itemName: row.item_name,
    amount: Number(row.amount),
    quantity: Number(row.quantity),
    quantityUnit: row.quantity_unit || 'NOS',
    purchaseDate: row.purchase_date,
    category: row.category,
    miscDescription: row.misc_description || '',
    proofFileName: row.proof_file_name || '',
    receiptUrl: row.receipt_url || '',
    receiptPath: row.receipt_path || '',
    authorizedBy: row.authorized_by,
    createdAt: row.created_at,
  }
}

async function fetchExpensesFromBackend() {
  if (!supabase) {
    return { data: [], error: new Error('Supabase is not configured.') }
  }

  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('created_at', { ascending: false })

  return {
    data: (data || []).map(normalizeExpenseRecord),
    error,
  }
}

function fileExtensionFor(file) {
  const nameParts = file.name.split('.')
  if (nameParts.length > 1) return nameParts.pop().toLowerCase()

  if (file.type.includes('/')) {
    return file.type.split('/').pop().toLowerCase()
  }

  return 'bin'
}

function isAcceptedReceiptFile(file) {
  if (!file) return false
  const extension = fileExtensionFor(file)
  const mimeType = (file.type || '').toLowerCase()
  return ALLOWED_RECEIPT_EXTENSIONS.has(extension) || ALLOWED_RECEIPT_MIME_TYPES.has(mimeType)
}

function receiptContentTypeFor(file) {
  if (file.type) return file.type

  const extension = fileExtensionFor(file)
  if (extension === 'pdf') return 'application/pdf'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'

  return 'application/octet-stream'
}

async function uploadReceiptToBackend(file, ownerEmail, expenseId) {
  if (!file || !supabase) {
    return { receiptUrl: '', receiptPath: '' }
  }

  const safeEmail = ownerEmail.replace(/[^a-z0-9@._-]/gi, '_')
  const receiptPath = `${safeEmail}/${expenseId}.${fileExtensionFor(file)}`

  const { error: uploadError } = await supabase.storage.from(RECEIPTS_BUCKET).upload(receiptPath, file, {
    contentType: receiptContentTypeFor(file),
    upsert: true,
  })

  if (uploadError) {
    throw uploadError
  }

  const { data } = supabase.storage.from(RECEIPTS_BUCKET).getPublicUrl(receiptPath)

  return {
    receiptUrl: data.publicUrl,
    receiptPath,
  }
}

function toDisplayDate(isoDate) {
  if (!isoDate) return '-'
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function escapeCsvValue(value) {
  const valueString = String(value ?? '')
  return `"${valueString.replace(/"/g, '""')}"`
}

function exportExpensesToCsv(expenses) {
  const headers = [
    'Date',
    'Item Description',
    'Authorized By',
    'Category',
    'Unit Amount',
    'Quantity',
    'Quantity Unit',
    'Misc Description',
    'Total Amount',
    'Proof of Purchase',
  ]

  const rows = expenses.map((expense) => [
    expense.purchaseDate,
    `${expense.itemName} (Qty: ${expense.quantity})`,
    expense.authorizedBy,
    expense.category,
    expense.amount.toFixed(2),
    expense.quantity,
    expense.quantityUnit || 'NOS',
    expense.miscDescription || '',
    (expense.amount * expense.quantity).toFixed(2),
    expense.proofFileName || 'N/A',
  ])

  const csvContent = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n')

  const file = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const downloadUrl = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = downloadUrl
  link.setAttribute('download', `vrt-ledger-${new Date().toISOString().split('T')[0]}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(downloadUrl)
}

function isImageReceipt(url) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url || '')
}

function isPdfReceipt(url) {
  return /\.pdf(\?|$)/i.test(url || '')
}

function formatQuantity(value, unit) {
  if (unit === 'KG') {
    return `${Number(value).toFixed(2)} KG`
  }

  return `${Number(value)} NOS`
}

function StatCard({ icon, label, value }) {
  const IconComponent = icon

  return (
    <div className="panel rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <IconComponent size={16} className="text-slate-900" />
        {label}
      </div>
      <p className="mt-2 text-xl font-semibold text-slate-950 sm:text-2xl">{value}</p>
    </div>
  )
}

function SectionTitle({ eyebrow, title, description }) {
  return (
    <div className="space-y-2">
      <p className="mono inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
        <Sparkles size={12} />
        {eyebrow}
      </p>
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  )
}

function SessionDateCard({ value, onChange }) {
  const inputRef = useRef(null)
  const displayValue = value ? toDisplayDate(value) : 'Select date'

  const openCalendar = () => {
    const input = inputRef.current
    if (!input) return

    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }

    input.click()
  }

  return (
    <button
      type="button"
      onClick={openCalendar}
      className="panel flex w-full flex-col rounded-2xl p-4 text-left transition hover:border-slate-400 hover:shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <CalendarDays size={16} className="text-slate-900" />
          Session Date
        </div>
      </div>
      <p className="mt-2 text-xl font-semibold text-slate-950 sm:text-2xl">{displayValue}</p>
      <input
        ref={inputRef}
        type="date"
        className="sr-only"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </button>
  )
}

function CategorySpendInsights({ summary, topSpenders, totalAmount }) {
  const gradient =
    summary.length === 0
      ? '#e2e8f0'
      : (() => {
          let current = 0
          const parts = summary.map((entry) => {
            const start = current
            current += entry.percent
            return `${entry.color} ${start.toFixed(2)}% ${current.toFixed(2)}%`
          })
          return `conic-gradient(${parts.join(', ')})`
        })()

  return (
    <div className="mb-5 grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-2">
      <div>
        <p className="text-sm font-semibold text-slate-900">Subsystem Spend Distribution</p>
        <p className="mt-1 text-xs text-slate-500">Visual split of total spend across engineering subsystems.</p>

        <div className="mt-4 flex items-center gap-4">
          <div
            className="h-32 w-32 rounded-full border border-slate-200"
            style={{ background: gradient }}
            aria-label="Subsystem spend pie chart"
          />
          <div className="space-y-2">
            {summary.length === 0 && <p className="text-xs text-slate-500">No spend data available for charting yet.</p>}
            {summary.map((entry) => (
              <div key={entry.category} className="flex items-center gap-2 text-xs text-slate-700">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                <span>{entry.category}</span>
                <span className="mono text-slate-500">{entry.percent.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-900">Top Spender by Subsystem</p>
        <p className="mt-1 text-xs text-slate-500">Quick finance insight into ownership of subsystem expense load.</p>
        <div className="mt-3 space-y-2">
          {topSpenders.map((entry) => (
            <div key={entry.category} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs font-medium text-slate-900">{entry.category}</p>
              {entry.email ? (
                <p className="mono mt-1 text-xs text-slate-600">
                  {entry.email} | {currency.format(entry.total)}
                </p>
              ) : (
                <p className="mono mt-1 text-xs text-slate-400">No spend recorded</p>
              )}
            </div>
          ))}
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs text-slate-500">Overall Total</p>
            <p className="mono text-xs font-semibold text-slate-900">{currency.format(totalAmount)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [loginEmail, setLoginEmail] = useState('')
  const [loginError, setLoginError] = useState('')
  const [session, setSession] = useState(null)
  const [sessionDate, setSessionDate] = useState(getTodayIsoDate())
  const [backendReady, setBackendReady] = useState(false)
  const [backendError, setBackendError] = useState('')

  const [form, setForm] = useState(initialForm)
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingExpenseId, setDeletingExpenseId] = useState('')
  const [expenses, setExpenses] = useState([])
  const [receiptPreview, setReceiptPreview] = useState(null)
  const submitLockRef = useRef(false)
  const recentSubmissionRef = useRef({ key: '', at: 0 })

  const isPrivileged = session ? PRIVILEGED_ROLES.has(session.role) : false

  useEffect(() => {
    let isMounted = true

    fetchExpensesFromBackend()
      .then((storedExpenses) => {
        if (storedExpenses.error) {
          throw storedExpenses.error
        }

        if (!isMounted) return
        setExpenses(storedExpenses.data)
        setBackendError('')
        setBackendReady(true)
      })
      .catch((error) => {
        console.error(error)
        if (!isMounted) return
        if (!isSupabaseConfigured) {
          setBackendError('Supabase is not configured yet. Add the env values to sync entries and receipts across devices.')
        } else {
          setBackendError('Unable to load entries from the backend right now.')
        }
        setBackendReady(true)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const visibleExpenses = useMemo(() => {
    if (!session) return []
    if (isPrivileged) return expenses
    return expenses.filter((entry) => entry.authorizedBy === session.email)
  }, [expenses, isPrivileged, session])

  const visibleExpenseTotal = useMemo(
    () => visibleExpenses.reduce((sum, row) => sum + row.amount * row.quantity, 0),
    [visibleExpenses],
  )

  const categorySummary = useMemo(() => {
    const totals = CATEGORIES.reduce((acc, category) => {
      acc[category] = 0
      return acc
    }, {})

    for (const row of expenses) {
      if (!Object.hasOwn(totals, row.category)) continue
      totals[row.category] += row.amount * row.quantity
    }

    const grandTotal = Object.values(totals).reduce((sum, value) => sum + value, 0)
    return CATEGORIES.map((category) => {
      const total = totals[category]
      const percent = grandTotal > 0 ? (total / grandTotal) * 100 : 0
      return {
        category,
        total,
        percent,
        color: CATEGORY_COLORS[category],
      }
    }).filter((entry) => entry.total > 0)
  }, [expenses])

  const topSpendersByCategory = useMemo(() => {
    return CATEGORIES.map((category) => {
      const spentByEmail = {}

      for (const row of expenses) {
        if (row.category !== category) continue
        const current = spentByEmail[row.authorizedBy] || 0
        spentByEmail[row.authorizedBy] = current + row.amount * row.quantity
      }

      let winnerEmail = ''
      let winnerTotal = 0
      for (const [email, total] of Object.entries(spentByEmail)) {
        if (total > winnerTotal) {
          winnerEmail = email
          winnerTotal = total
        }
      }

      return {
        category,
        email: winnerEmail,
        total: winnerTotal,
      }
    })
  }, [expenses])

  const entryCountForSession = visibleExpenses.length

  const handleLogin = (event) => {
    event.preventDefault()
    const normalized = loginEmail.trim().toLowerCase()

    if (!normalized) {
      setLoginError('Enter your club email address.')
      return
    }

    const account = USER_DIRECTORY[normalized]

    if (!account) {
      setLoginError('Access denied. Use an authorized club email.')
      return
    }

    setLoginError('')
    setSession({ email: normalized, role: account.role, label: account.label })
  }

  const handleFormChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSessionDateChange = (nextDate) => {
    setSessionDate(nextDate)
    setForm((current) => ({
      ...current,
      purchaseDate: nextDate,
    }))
  }

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0]

    if (selectedFile && !isAcceptedReceiptFile(selectedFile)) {
      setFormError('Unsupported file type. Please upload PDF, JPG, JPEG, PNG, or WEBP.')
      event.target.value = ''
      setForm((current) => ({
        ...current,
        proofFileName: '',
        proofFile: null,
      }))
      return
    }

    setFormError('')
    setForm((current) => ({
      ...current,
      proofFileName: selectedFile ? selectedFile.name : '',
      proofFile: selectedFile || null,
    }))
  }

  const openReceipt = (expense) => {
    if (!expense.receiptUrl) return
    setReceiptPreview({
      url: expense.receiptUrl,
      fileName: expense.proofFileName || 'Receipt',
    })
  }

  const closeReceiptPreview = () => {
    setReceiptPreview(null)
  }

  const handleDeleteExpense = async (expense) => {
    if (!isPrivileged || !expense?.id || !supabase) return

    const confirmed = window.confirm('Delete this expense entry? This cannot be undone.')
    if (!confirmed) return

    setDeletingExpenseId(expense.id)
    setFormError('')

    try {
      const { error: deleteRowError } = await supabase.from('expenses').delete().eq('id', expense.id)
      if (deleteRowError) {
        throw deleteRowError
      }

      if (expense.receiptPath) {
        const { error: removeReceiptError } = await supabase.storage
          .from(RECEIPTS_BUCKET)
          .remove([expense.receiptPath])

        if (removeReceiptError) {
          console.error(removeReceiptError)
          setBackendError('Entry deleted, but the linked receipt file could not be removed from storage.')
        }
      }

      setExpenses((current) => current.filter((row) => row.id !== expense.id))
    } catch (error) {
      console.error(error)
      setFormError(`Failed to delete entry: ${error.message}`)
    } finally {
      setDeletingExpenseId('')
    }
  }

  const handleSubmitExpense = async (event) => {
    event.preventDefault()
    if (isSubmitting || submitLockRef.current) return
    setFormError('')

    const amount = Number(form.amount)
    const quantity = Number(form.quantity)

    if (!form.itemName.trim()) {
      setFormError('Item name is required.')
      return
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Amount must be a number greater than zero.')
      return
    }

    if (form.quantityUnit === 'NOS' && (!Number.isInteger(quantity) || quantity <= 0)) {
      setFormError('For NOS, quantity must be a whole number greater than zero.')
      return
    }

    if (form.quantityUnit === 'KG' && (!Number.isFinite(quantity) || quantity <= 0)) {
      setFormError('For KG, quantity must be a number greater than zero.')
      return
    }

    if (!form.purchaseDate) {
      setFormError('Purchase date is required.')
      return
    }

    if (!form.category) {
      setFormError('Select a category.')
      return
    }

    if (form.category === 'Miscellaneous' && form.miscDescription.trim().length < 5) {
      setFormError('Add a short description for Miscellaneous entries (min 5 characters).')
      return
    }

    if (!session) {
      setFormError('Session expired. Please log in again.')
      return
    }

    if (!isSupabaseConfigured) {
      setFormError('Supabase must be configured to save entries.')
      return
    }

    if (!backendReady) {
      setFormError('Please wait while the backend loads.')
      return
    }

    const submissionKey = [
      session.email,
      form.itemName.trim().toLowerCase(),
      amount.toFixed(2),
      String(quantity),
      form.quantityUnit,
      form.purchaseDate,
      form.category,
      form.miscDescription.trim().toLowerCase(),
    ].join('|')

    const now = Date.now()
    if (recentSubmissionRef.current.key === submissionKey && now - recentSubmissionRef.current.at < 8000) {
      setFormError('Duplicate submission blocked. Please wait a moment before submitting the same entry again.')
      return
    }

    const expenseId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    submitLockRef.current = true
    setIsSubmitting(true)

    try {
      let receiptUrl = ''
      let receiptPath = ''
      let proofFileName = form.proofFileName

      if (form.proofFile) {
        try {
          const receiptUpload = await uploadReceiptToBackend(form.proofFile, session.email, expenseId)
          receiptUrl = receiptUpload.receiptUrl
          receiptPath = receiptUpload.receiptPath
        } catch (uploadError) {
          console.error(uploadError)
          proofFileName = ''
          setBackendError('Receipt upload failed on this device. Expense was saved without the receipt file.')
        }
      }

      const nextExpense = {
        id: expenseId,
        itemName: form.itemName.trim(),
        amount,
        quantity,
        quantityUnit: form.quantityUnit,
        purchaseDate: form.purchaseDate,
        category: form.category,
        miscDescription: form.miscDescription.trim(),
        proofFileName,
        receiptUrl,
        receiptPath,
        authorizedBy: session.email,
        createdAt,
      }

      const payload = {
        id: nextExpense.id,
        item_name: nextExpense.itemName,
        amount: nextExpense.amount,
        quantity: nextExpense.quantity,
        quantity_unit: nextExpense.quantityUnit,
        purchase_date: nextExpense.purchaseDate,
        category: nextExpense.category,
        misc_description: nextExpense.miscDescription,
        proof_file_name: nextExpense.proofFileName,
        receipt_url: nextExpense.receiptUrl,
        receipt_path: nextExpense.receiptPath,
        authorized_by: nextExpense.authorizedBy,
        created_at: nextExpense.createdAt,
      }

      const { data, error } = await supabase.from('expenses').insert(payload).select('*').single()

      if (error) {
        throw error
      }

      const savedExpense = data ? normalizeExpenseRecord(data) : nextExpense
      setExpenses((current) => [savedExpense, ...current])
      recentSubmissionRef.current = { key: submissionKey, at: Date.now() }
      setFormError('')
      setForm({ ...initialForm, purchaseDate: sessionDate })
    } catch (error) {
      console.error(error)
      setFormError(`Failed to save entry: ${error.message}`)
    } finally {
      setIsSubmitting(false)
      submitLockRef.current = false
    }
  }

  const logout = () => {
    setSession(null)
    setLoginEmail('')
    setLoginError('')
    setSessionDate(getTodayIsoDate())
    setForm(initialForm)
    setFormError('')
  }

  if (!session) {
    return (
      <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-[-8rem] h-72 w-72 -translate-x-1/2 rounded-full bg-slate-200 blur-3xl" />
        </div>

        <section className="panel relative w-full max-w-md rounded-[2rem] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] sm:p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              VRT Ledger
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Sign in with your club email to continue.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleLogin}>
            <label className="block text-sm text-slate-700">
              Email address
              <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-slate-400">
                <Mail size={16} className="text-slate-500" />
                <input
                  type="email"
                  className="w-full bg-transparent px-2 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-400"
                  placeholder="Enter your club email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                />
              </div>
            </label>

            {loginError && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800"
            >
              Continue
              <ArrowRight size={16} />
            </button>
          </form>

        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 pb-8 pt-6 sm:px-6 lg:px-10 lg:pb-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="panel flex flex-col gap-4 rounded-[2rem] p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mono inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
              <ShieldCheck size={14} />
              {session.label}
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              VRT Ledger
            </h1>
            <p className="mt-2 text-sm text-slate-500">Production-grade expense operations with secure cloud sync and audit-ready records.</p>
          </div>

          <div className="flex items-center gap-3">
            <p className="mono rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 sm:text-sm">
              {session.email}
            </p>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition hover:border-slate-400"
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={BadgeDollarSign}
            label={isPrivileged ? 'All Expenses' : 'My Entries'}
            value={currency.format(visibleExpenseTotal)}
          />
          <StatCard
            icon={Receipt}
            label={isPrivileged ? 'Session Entries' : 'My Submissions'}
            value={String(entryCountForSession)}
          />
          <SessionDateCard value={sessionDate} onChange={handleSessionDateChange} />
        </section>

        {backendError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {backendError}
          </div>
        )}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <article className="panel rounded-[2rem] p-5 sm:p-6 xl:col-span-4">
            <SectionTitle
              eyebrow="New Entry"
              title="Add an Expense"
              description="Create a verified expense record and sync it instantly to the shared finance ledger."
            />
            <form className="mt-5 space-y-4" onSubmit={handleSubmitExpense}>
              <div>
                <label className="mb-2 block text-sm text-slate-700">Item Name</label>
                <input
                  name="itemName"
                  type="text"
                  value={form.itemName}
                  onChange={handleFormChange}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                  placeholder="Enter item name"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-slate-700">Amount (INR)</label>
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                    placeholder="Enter amount"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm text-slate-700">Quantity</label>
                  <input
                    name="quantity"
                    type="number"
                    min={form.quantityUnit === 'KG' ? '0.01' : '1'}
                    step={form.quantityUnit === 'KG' ? '0.01' : '1'}
                    value={form.quantity}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                    placeholder="Enter quantity"
                    required
                  />
                  <select
                    name="quantityUnit"
                    value={form.quantityUnit}
                    onChange={handleFormChange}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-slate-400"
                  >
                    {QUANTITY_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-slate-700">Purchase Date</label>
                  <input
                    name="purchaseDate"
                    type="date"
                    value={form.purchaseDate}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm text-slate-700">Category</label>
                  <select
                    name="category"
                    value={form.category}
                    onChange={handleFormChange}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400"
                  >
                    <option value="" disabled>
                      Select category
                    </option>
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {form.category === 'Miscellaneous' && (
                <div>
                  <label className="mb-2 block text-sm text-slate-700">Misc Description</label>
                  <textarea
                    name="miscDescription"
                    value={form.miscDescription}
                    onChange={handleFormChange}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                    placeholder="Explain what this expense was for"
                    required
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm text-slate-700">Proof of Purchase (optional)</label>
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600 transition hover:border-slate-500 hover:text-slate-950">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <FileUp size={16} className="shrink-0 text-slate-900" />
                    <span className="truncate">{form.proofFileName || 'Choose receipt file'}</span>
                  </span>
                  <input type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" />
                  <span className="shrink-0 mono text-xs text-slate-400">PDF / JPG / PNG</span>
                </label>
              </div>

              {formError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={!backendReady || isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-950"
              >
                {isSubmitting ? 'Saving...' : 'Submit Expense'}
                <ArrowRight size={16} />
              </button>
            </form>
          </article>

          <article className="panel rounded-[2rem] p-5 sm:p-6 xl:col-span-8">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SectionTitle
                eyebrow={isPrivileged ? 'Finance View' : 'Member View'}
                title={isPrivileged ? 'Ledger Overview' : 'Your Submissions'}
                description={
                  isPrivileged
                    ? 'Admins and treasurers can review every entry and export the session at month end.'
                    : 'Members can submit expenses and review their own entries only.'
                }
              />
              {isPrivileged && (
                <button
                  type="button"
                  onClick={() => exportExpensesToCsv(expenses)}
                  disabled={expenses.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  <Download size={16} />
                  Export CSV
                </button>
              )}
            </div>

            {visibleExpenses.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-14 text-center">
                <p className="text-base font-medium text-slate-950">
                  {isPrivileged ? 'No expenses logged yet.' : 'No submissions from your session yet.'}
                </p>
                <p className="mt-2 text-sm text-slate-500">Use the form to create the first entry.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                {isPrivileged && (
                  <div className="border-b border-slate-200 bg-white p-4">
                    <CategorySpendInsights
                      summary={categorySummary}
                      topSpenders={topSpendersByCategory}
                      totalAmount={visibleExpenseTotal}
                    />
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-slate-600">
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Item Description</th>
                        {isPrivileged && <th className="px-4 py-3 font-medium">Authorized By</th>}
                        <th className="px-4 py-3 font-medium">Receipt</th>
                        <th className="px-4 py-3 font-medium">Total Amount</th>
                        {isPrivileged && <th className="px-4 py-3 font-medium text-right">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {visibleExpenses.map((expense) => {
                        const rowTotal = expense.amount * expense.quantity
                        return (
                          <tr key={expense.id} className="text-slate-900">
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              {toDisplayDate(expense.purchaseDate)}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-950">{expense.itemName}</p>
                              <p className="mono mt-1 text-xs text-slate-500">
                                Qty: {formatQuantity(expense.quantity, expense.quantityUnit)} | {expense.category}
                              </p>
                              {expense.category === 'Miscellaneous' && expense.miscDescription && (
                                <p className="mt-1 text-xs text-slate-500">Note: {expense.miscDescription}</p>
                              )}
                            </td>
                            {isPrivileged && (
                              <td className="px-4 py-3">
                                <span className="mono text-xs text-slate-500">{expense.authorizedBy}</span>
                              </td>
                            )}
                            <td className="px-4 py-3">
                              {expense.receiptUrl ? (
                                <button
                                  type="button"
                                  onClick={() => openReceipt(expense)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                                >
                                  <ExternalLink size={12} />
                                  Open receipt
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">Not attached</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-950">{currency.format(rowTotal)}</td>
                            {isPrivileged && (
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExpense(expense)}
                                  disabled={deletingExpenseId === expense.id}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <Trash2 size={12} />
                                  {deletingExpenseId === expense.id ? 'Deleting...' : 'Delete'}
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 text-slate-950">
                      <tr>
                        <td className="px-4 py-3" colSpan={isPrivileged ? 5 : 3}>
                          Grand Total
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-950">{currency.format(visibleExpenseTotal)}</td>
                        {isPrivileged && <td className="px-4 py-3" />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {backendError && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {backendError}
              </div>
            )}

          </article>
        </section>
      </div>

      {receiptPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6">
          <div className="panel w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.25)] sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Receipt Preview</p>
                <p className="truncate text-xs text-slate-500">{receiptPreview.fileName}</p>
              </div>
              <button
                type="button"
                onClick={closeReceiptPreview}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
              >
                <X size={14} />
                Close
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {isImageReceipt(receiptPreview.url) && (
                <div className="flex h-[65vh] items-center justify-center p-3">
                  <img
                    src={receiptPreview.url}
                    alt="Receipt preview"
                    className="max-h-full max-w-full rounded-lg object-contain"
                  />
                </div>
              )}

              {isPdfReceipt(receiptPreview.url) && (
                <iframe
                  title="Receipt PDF preview"
                  src={receiptPreview.url}
                  className="h-[65vh] w-full"
                />
              )}

              {!isImageReceipt(receiptPreview.url) && !isPdfReceipt(receiptPreview.url) && (
                <div className="flex h-52 flex-col items-center justify-center gap-3 p-4 text-center">
                  <p className="text-sm text-slate-600">This file type cannot be previewed inline.</p>
                  <a
                    href={receiptPreview.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                  >
                    <ExternalLink size={12} />
                    Open in new tab
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
