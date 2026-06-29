import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

function formatTimestamp(dateStr) {
  const date = new Date(dateStr)
  const day = DAYS[date.getDay()]
  const tanggal = date.getDate()
  const bulan = date.toLocaleString('id-ID', { month: 'short' })
  const tahun = date.getFullYear()
  const jam = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${tanggal} ${bulan} ${tahun} · ${jam}`
}

function AdminPage() {
  const [tab, setTab] = useState('workorder')
  const [orders, setOrders] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [optionGroups, setOptionGroups] = useState([])
  const [dailyTotals, setDailyTotals] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState({ order_cutoff_hour: 7, workorder_cutoff_hour: 9 })
  const [settingsForm, setSettingsForm] = useState({ order_cutoff_hour: '', workorder_cutoff_hour: '' })
  const [historyDate, setHistoryDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [historyOrders, setHistoryOrders] = useState([])
  const [historyFilter, setHistoryFilter] = useState('untuk')
  const [allUnpaidOrders, setAllUnpaidOrders] = useState([])
  const [allCustomers, setAllCustomers] = useState([])
  const [topUpAmount, setTopUpAmount] = useState({})
  const [topUpNote, setTopUpNote] = useState({})
  const [manualBillAmount, setManualBillAmount] = useState({})
  const [manualBillNote, setManualBillNote] = useState({})
  const [manualBillUseCredit, setManualBillUseCredit] = useState({})
  const [bonusAmount, setBonusAmount] = useState({})
  const [bonusNote, setBonusNote] = useState({})
  const [manualDiscountAmount, setManualDiscountAmount] = useState({})
  const [paymentAccounts, setPaymentAccounts] = useState([])
  const [paForm, setPaForm] = useState({ bank_name: '', account_number: '', account_name: '', sort_order: 0 })
  const [editingPa, setEditingPa] = useState(null)
  const [closedDays, setClosedDays] = useState([])
  const [closedDayForm, setClosedDayForm] = useState({ type: 'recurring', day_of_week: 1, specific_date: '', note: '' })
  const [batchSettings, setBatchSettings] = useState(null)
  const [batchForm, setBatchForm] = useState({ is_active: false, open_hour: 8, open_minute: 30, close_hour: 17, close_minute: 0, shot_stock: 0 })
  const [promos, setPromos] = useState([])
  const [promoForm, setPromoForm] = useState({ name: '', type: 'overall', discount_type: 'percent', discount_amount: '', menu_item_id: '', start_date: '', end_date: '', stackable: false, priority: 0 })
  const [editingPromo, setEditingPromo] = useState(null)
  const [adminMenuFull, setAdminMenuFull] = useState([])
  // dateGroups: [{ id, date, customerGroups: [{ id, customerId, isNew, newPhone, newName, items: [{ cartId, item, selectedOptions, quantity }] }] }]
  const [dateGroups, setDateGroups] = useState([])
  const [workDateLabel, setWorkDateLabel] = useState('')
  const [workOrderView, setWorkOrderView] = useState('po') // 'po' or 'langsung'
  const [workViewDefaultSet, setWorkViewDefaultSet] = useState(false)
  const [langsungOrders, setLangsungOrders] = useState([])
  const [menuForm, setMenuForm] = useState({ name: '', price: '', daily_limit: '', available_days: [0,1,2,3,4,5,6], active: true, sort_order: 0, image_url: '', batch2_eligible: false })
  const [menuFormGroups, setMenuFormGroups] = useState([])
  const [editingMenu, setEditingMenu] = useState(null)
  const [ogForm, setOgForm] = useState({ name: '', required: true, choices: [{ label: '', price_addition: 0 }] })
  const [editingOg, setEditingOg] = useState(null)
  const [globalLimit, setGlobalLimit] = useState('')
  const [globalLimitSaved, setGlobalLimitSaved] = useState(localStorage.getItem('globalDailyLimit') || '')

  const fetchMenu = useCallback(async () => {
    const { data } = await supabase.from('menu_items').select(`*, menu_item_option_groups(option_group_id)`).order('sort_order', { ascending: true })
    if (data) setMenuItems(data)
  }, [])

  const fetchOptionGroups = useCallback(async () => {
    const { data } = await supabase.from('option_groups').select(`*, option_choices(*)`).order('name')
    if (data) setOptionGroups(data)
  }, [])

  const fetchDailyTotals = useCallback(async () => {
    const { data } = await supabase.from('daily_item_totals').select('*')
    if (data) {
      const map = {}
      data.forEach(d => { map[d.menu_item_id] = d.total_ordered })
      setDailyTotals(map)
    }
  }, [])

  const fetchWorkOrders = useCallback(async () => {
    const { data: settingsData } = await supabase.from('settings').select('*')
    let cutoffOrder = 7, cutoffWork = 9
    if (settingsData) {
      const map = {}
      settingsData.forEach(d => { map[d.key] = parseInt(d.value) })
      cutoffOrder = map.order_cutoff_hour ?? 7
      cutoffWork = map.workorder_cutoff_hour ?? 9
      setSettings(map)
      setSettingsForm({ order_cutoff_hour: map.order_cutoff_hour, workorder_cutoff_hour: map.workorder_cutoff_hour })
    }
    const now = new Date()
    const hour = now.getHours()
    const deliveryDate = new Date(now)
    if (cutoffWork < cutoffOrder) {
      if (hour >= cutoffOrder) deliveryDate.setDate(deliveryDate.getDate() + 1)
    } else {
      if (hour >= cutoffWork) deliveryDate.setDate(deliveryDate.getDate() + 1)
    }
    const deliveryStr = deliveryDate.toLocaleDateString('en-CA')
    setWorkDateLabel(`${DAYS[deliveryDate.getDay()]}, ${deliveryDate.getDate()} ${deliveryDate.toLocaleString('id-ID', { month: 'short' })} ${deliveryDate.getFullYear()}`)
    const { data } = await supabase
      .from('orders')
      .select(`*, customers(name, phone), order_items(*, order_item_options(*))`)
      .eq('order_for_date', deliveryStr)
      .eq('voided', false)
      .order('created_at', { ascending: true })
    if (data) setOrders(data)
  }, [])

  const fetchLangsungOrders = useCallback(async () => {
    const today = new Date().toLocaleDateString('en-CA')
    const { data } = await supabase
      .from('orders')
      .select(`*, customers(name, phone), order_items(*, order_item_options(*))`)
      .eq('order_for_date', today)
      .eq('batch_type', 'batch2')
      .eq('voided', false)
      .order('created_at', { ascending: true })
    if (data) setLangsungOrders(data)
  }, [])

  const fetchHistoryOrders = useCallback(async (dateStr, filterType) => {
    let query = supabase.from('orders').select(`*, customers(name, phone), order_items(*, order_item_options(*))`)
    if (filterType === 'untuk') query = query.eq('order_for_date', dateStr)
    else query = query.gte('created_at', `${dateStr}T00:00:00`).lt('created_at', `${dateStr}T23:59:59`)
    const { data } = await query.order('created_at', { ascending: true })
    if (data) setHistoryOrders(data)
  }, [])

  const fetchAllUnpaid = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select(`*, customers(name, phone), order_items(*, order_item_options(*))`)
      .eq('paid', false)
      .eq('voided', false)
      .order('created_at', { ascending: true })
    if (data) setAllUnpaidOrders(data)
  }, [])

  const fetchAllCustomers = useCallback(async () => {
    const { data } = await supabase.from('customers').select('*').order('name')
    if (data) setAllCustomers(data)
  }, [])

  const fetchPaymentAccounts = useCallback(async () => {
    const { data } = await supabase.from('payment_accounts').select('*').order('sort_order')
    if (data) setPaymentAccounts(data)
  }, [])

  const fetchClosedDays = useCallback(async () => {
    const { data } = await supabase.from('closed_days').select('*').order('created_at')
    if (data) setClosedDays(data)
  }, [])

  const fetchBatchSettings = useCallback(async () => {
    const today = new Date().toLocaleDateString('en-CA')
    const { data } = await supabase.from('batch_settings').select('*').eq('batch_date', today).single()
    if (data) {
      setBatchSettings(data)
      setBatchForm({
        is_active: data.is_active, open_hour: data.open_hour, open_minute: data.open_minute,
        close_hour: data.close_hour, close_minute: data.close_minute, shot_stock: data.shot_stock
      })
    } else {
      setBatchSettings(null)
    }
  }, [])

  useEffect(() => {
    if (!workViewDefaultSet && batchSettings !== null) {
      const isOpen = batchSettings.is_active && (batchSettings.shot_stock - batchSettings.shot_used) > 0
      setWorkOrderView(isOpen ? 'langsung' : 'po')
      setWorkViewDefaultSet(true)
    }
  }, [batchSettings, workViewDefaultSet])

  const fetchPromos = useCallback(async () => {
    const { data } = await supabase.from('promos').select('*, menu_items(name)').order('priority')
    if (data) setPromos(data)
  }, [])

  const fetchAdminMenuFull = useCallback(async () => {
    const { data } = await supabase
      .from('menu_items')
      .select(`*, menu_item_option_groups(option_group_id, option_groups(id, name, required, option_choices(id, label, sort_order, price_addition)))`)
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (data) setAdminMenuFull(data.map(item => ({
      ...item,
      optionGroups: item.menu_item_option_groups.map(r => ({
        ...r.option_groups,
        choices: [...r.option_groups.option_choices].sort((a, b) => a.sort_order - b.sort_order)
      }))
    })))
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      await fetchWorkOrders()
      await fetchLangsungOrders()
      await fetchAllUnpaid()
      await fetchAllCustomers()
      await fetchPaymentAccounts()
      await fetchClosedDays()
      await fetchBatchSettings()
      await fetchAdminMenuFull()
      await fetchPromos()
      await Promise.all([fetchMenu(), fetchOptionGroups(), fetchDailyTotals()])
      setLoading(false)
    }
    init()
  }, [fetchWorkOrders, fetchLangsungOrders, fetchAllUnpaid, fetchAllCustomers, fetchPaymentAccounts, fetchClosedDays, fetchBatchSettings, fetchAdminMenuFull, fetchPromos, fetchMenu, fetchOptionGroups, fetchDailyTotals])

  async function handleTopUp(customerId, phone) {
    const amount = parseInt(topUpAmount[phone])
    if (!amount || amount <= 0) return
    const customer = allCustomers.find(c => c.id === customerId)
    let remainingCredit = (customer?.credit_balance || 0) + amount
    await supabase.from('customer_credits').insert({ customer_id: customerId, amount, note: topUpNote[phone] || '' })
    const unpaidOrders = allUnpaidOrders.filter(o => o.customers?.phone === phone)
    for (const o of unpaidOrders) {
      const orderBill = o.order_items.reduce((s, oi) => s + oi.price_at_order * oi.quantity, 0) - (o.promo_discount || 0) - (o.bonus_used || 0) - (o.manual_discount || 0) - (o.credit_used || 0)
      if (orderBill <= 0) { await supabase.from('orders').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', o.id); continue }
      if (remainingCredit >= orderBill) {
        remainingCredit -= orderBill
        await supabase.from('orders').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', o.id)
      } else if (remainingCredit > 0) {
        await supabase.from('orders').update({ credit_used: (o.credit_used || 0) + remainingCredit }).eq('id', o.id)
        remainingCredit = 0
      }
    }
    await supabase.from('customers').update({ credit_balance: remainingCredit }).eq('id', customerId)
    setTopUpAmount(prev => ({ ...prev, [phone]: '' }))
    setTopUpNote(prev => ({ ...prev, [phone]: '' }))
    fetchAllCustomers(); fetchAllUnpaid()
  }

  async function handleBonusGive(customerId, phone) {
    const amount = parseInt(bonusAmount[phone])
    if (!amount || amount <= 0) return

    const customer = allCustomers.find(c => c.id === customerId)
    let remainingBonus = (customer?.bonus_balance || 0) + amount

    await supabase.from('customer_bonuses').insert({
      customer_id: customerId,
      amount,
      note: bonusNote[phone] || ''
    })

    const unpaidOrders = allUnpaidOrders.filter(o => o.customers?.phone === phone)
    for (const o of unpaidOrders) {
      const subtotal = o.order_items.reduce((s, oi) => s + oi.price_at_order * oi.quantity, 0)
      const orderBill = subtotal - (o.promo_discount || 0) - (o.bonus_used || 0) - (o.manual_discount || 0) - (o.credit_used || 0)
      if (orderBill <= 0) {
        await supabase.from('orders').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', o.id)
        continue
      }
      if (remainingBonus >= orderBill) {
        remainingBonus -= orderBill
        await supabase.from('orders').update({ bonus_used: (o.bonus_used || 0) + orderBill, paid: true, paid_at: new Date().toISOString() }).eq('id', o.id)
      } else if (remainingBonus > 0) {
        await supabase.from('orders').update({ bonus_used: (o.bonus_used || 0) + remainingBonus }).eq('id', o.id)
        remainingBonus = 0
      }
    }

    await supabase.from('customers').update({ bonus_balance: remainingBonus }).eq('id', customerId)

    setBonusAmount(prev => ({ ...prev, [phone]: '' }))
    setBonusNote(prev => ({ ...prev, [phone]: '' }))
    fetchAllCustomers()
    fetchAllUnpaid()
  }

  async function applyManualDiscount(orderId, customerId, phone) {
    const amount = parseInt(manualDiscountAmount[orderId])
    if (!amount || amount <= 0) return

    const order = allUnpaidOrders.find(o => o.id === orderId)
    if (!order) return

    const subtotal = order.order_items.reduce((s, oi) => s + oi.price_at_order * oi.quantity, 0)
    const currentBill = subtotal - (order.promo_discount || 0) - (order.bonus_used || 0) - (order.credit_used || 0)
    const discountToApply = Math.min(amount, currentBill)

    const newManualDiscount = (order.manual_discount || 0) + discountToApply
    const newBill = currentBill - discountToApply
    const isPaid = newBill <= 0

    await supabase.from('orders').update({
      manual_discount: newManualDiscount,
      manual_discount_note: manualDiscountAmount[`${orderId}_note`] || order.manual_discount_note || '',
      paid: isPaid,
      paid_at: isPaid ? new Date().toISOString() : null
    }).eq('id', orderId)

    setManualDiscountAmount(prev => ({ ...prev, [orderId]: '' }))
    fetchAllUnpaid()
    fetchAllCustomers()
  }

  async function handleManualBill(customerId, phone) {
    const amount = parseInt(manualBillAmount[phone])
    if (!amount || amount <= 0) return
    const note = manualBillNote[phone] || 'Tagihan manual'
    const useCredit = manualBillUseCredit[phone] ?? true
    const customer = allCustomers.find(c => c.id === customerId)
    let creditUsed = 0
    if (useCredit && (customer?.credit_balance || 0) > 0) {
      creditUsed = Math.min(customer.credit_balance, amount)
      await supabase.from('customers').update({ credit_balance: customer.credit_balance - creditUsed }).eq('id', customerId)
    }
    const isPaid = creditUsed >= amount
    const { data: order } = await supabase.from('orders').insert({
      customer_id: customerId, order_for_date: new Date().toLocaleDateString('en-CA'),
      credit_used: creditUsed, paid: isPaid, voided: false,
      paid_at: isPaid ? new Date().toISOString() : null
    }).select().single()
    if (order) {
      await supabase.from('order_items').insert({ order_id: order.id, menu_item_id: null, menu_item_name: note, price_at_order: amount, quantity: 1 })
    }
    setManualBillAmount(prev => ({ ...prev, [phone]: '' }))
    setManualBillNote(prev => ({ ...prev, [phone]: '' }))
    fetchAllCustomers(); fetchAllUnpaid()
  }

  async function voidOrder(orderId) {
    if (!window.confirm('Void order ini? Credit yang sudah terpotong akan dikembalikan ke customer.')) return
    const order = allUnpaidOrders.find(o => o.id === orderId) || orders.find(o => o.id === orderId)
    if (!order) return
    if (order.credit_used > 0) {
      const { data: cust } = await supabase.from('customers').select('credit_balance').eq('id', order.customer_id).single()
      await supabase.from('customers').update({ credit_balance: (cust?.credit_balance || 0) + order.credit_used }).eq('id', order.customer_id)
    }
    await supabase.from('orders').update({ voided: true, voided_at: new Date().toISOString() }).eq('id', orderId)
    fetchAllUnpaid(); fetchAllCustomers(); fetchWorkOrders()
  }

  async function savePromo() {
    if (!promoForm.name.trim() || !promoForm.discount_amount || !promoForm.start_date || !promoForm.end_date) {
      setError('Lengkapi semua field promo.'); return
    }
    if (promoForm.type === 'product' && !promoForm.menu_item_id) {
      setError('Pilih menu untuk promo produk.'); return
    }
    setError('')
    const payload = {
      name: promoForm.name.trim(),
      type: promoForm.type,
      discount_type: promoForm.discount_type,
      discount_amount: parseFloat(promoForm.discount_amount),
      menu_item_id: promoForm.type === 'product' ? promoForm.menu_item_id : null,
      start_date: promoForm.start_date,
      end_date: promoForm.end_date,
      stackable: promoForm.stackable,
      priority: parseInt(promoForm.priority) || 0,
      active: true
    }
    if (editingPromo) {
      await supabase.from('promos').update(payload).eq('id', editingPromo)
    } else {
      await supabase.from('promos').insert(payload)
    }
    setPromoForm({ name: '', type: 'overall', discount_type: 'percent', discount_amount: '', menu_item_id: '', start_date: '', end_date: '', stackable: false, priority: 0 })
    setEditingPromo(null)
    fetchPromos()
  }

  function startEditPromo(p) {
    setEditingPromo(p.id)
    setPromoForm({
      name: p.name, type: p.type, discount_type: p.discount_type, discount_amount: p.discount_amount,
      menu_item_id: p.menu_item_id || '', start_date: p.start_date, end_date: p.end_date,
      stackable: p.stackable, priority: p.priority
    })
  }

  async function deletePromo(id) {
    if (!window.confirm('Hapus promo ini?')) return
    await supabase.from('promos').delete().eq('id', id)
    fetchPromos()
  }

  async function movePromoPriority(id, direction) {
    const idx = promos.findIndex(p => p.id === id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= promos.length) return
    const a = promos[idx], b = promos[swapIdx]
    const newPromos = [...promos]
    newPromos[idx] = { ...b, priority: a.priority }
    newPromos[swapIdx] = { ...a, priority: b.priority }
    setPromos(newPromos)
    await supabase.from('promos').update({ priority: b.priority }).eq('id', a.id)
    await supabase.from('promos').update({ priority: a.priority }).eq('id', b.id)
  }

  async function togglePromoActive(id, current) {
    await supabase.from('promos').update({ active: !current }).eq('id', id)
    fetchPromos()
  }

  function addDateGroup() {
    setDateGroups(prev => [...prev, {
      id: Date.now(),
      date: new Date().toLocaleDateString('en-CA'),
      customerGroups: []
    }])
  }

  function removeDateGroup(groupId) {
    setDateGroups(prev => prev.filter(g => g.id !== groupId))
  }

  function updateDateGroupDate(groupId, date) {
    setDateGroups(prev => prev.map(g => g.id === groupId ? { ...g, date } : g))
  }

  function addCustomerGroup(dateGroupId) {
    setDateGroups(prev => prev.map(g => g.id === dateGroupId ? {
      ...g,
      customerGroups: [...g.customerGroups, { id: Date.now(), customerId: '', isNew: false, newPhone: '', newName: '', items: [] }]
    } : g))
  }

  function removeCustomerGroup(dateGroupId, custGroupId) {
    setDateGroups(prev => prev.map(g => g.id === dateGroupId ? {
      ...g,
      customerGroups: g.customerGroups.filter(cg => cg.id !== custGroupId)
    } : g))
  }

  function updateCustomerGroup(dateGroupId, custGroupId, updates) {
    setDateGroups(prev => prev.map(g => g.id === dateGroupId ? {
      ...g,
      customerGroups: g.customerGroups.map(cg => cg.id === custGroupId ? { ...cg, ...updates } : cg)
    } : g))
  }

  function addItemToCustomerGroup(dateGroupId, custGroupId, item) {
    const defaultOptions = {}
    item.optionGroups.forEach(og => {
      if (og.required && og.choices.length > 0) defaultOptions[og.id] = og.choices[0]
    })
    setDateGroups(prev => prev.map(g => g.id === dateGroupId ? {
      ...g,
      customerGroups: g.customerGroups.map(cg => cg.id === custGroupId ? {
        ...cg,
        items: [...cg.items, { cartId: Date.now(), item, selectedOptions: defaultOptions, quantity: 1 }]
      } : cg)
    } : g))
  }

  function updateItemQty(dateGroupId, custGroupId, cartId, delta) {
    setDateGroups(prev => prev.map(g => g.id === dateGroupId ? {
      ...g,
      customerGroups: g.customerGroups.map(cg => cg.id === custGroupId ? {
        ...cg,
        items: cg.items.map(it => it.cartId === cartId ? { ...it, quantity: it.quantity + delta } : it).filter(it => it.quantity > 0)
      } : cg)
    } : g))
  }

  function removeItem(dateGroupId, custGroupId, cartId) {
    setDateGroups(prev => prev.map(g => g.id === dateGroupId ? {
      ...g,
      customerGroups: g.customerGroups.map(cg => cg.id === custGroupId ? {
        ...cg,
        items: cg.items.filter(it => it.cartId !== cartId)
      } : cg)
    } : g))
  }

  function updateItemOption(dateGroupId, custGroupId, cartId, groupId, choice) {
    setDateGroups(prev => prev.map(g => g.id === dateGroupId ? {
      ...g,
      customerGroups: g.customerGroups.map(cg => cg.id === custGroupId ? {
        ...cg,
        items: cg.items.map(it => it.cartId === cartId ? { ...it, selectedOptions: { ...it.selectedOptions, [groupId]: choice } } : it)
      } : cg)
    } : g))
  }

  function getItemPriceAdmin(it) {
    const optionsTotal = Object.values(it.selectedOptions).reduce((sum, choice) => sum + (choice?.price_addition || 0), 0)
    return (it.item.price + optionsTotal) * it.quantity
  }

  function getCustomerGroupTotal(cg) {
    return cg.items.reduce((sum, it) => sum + getItemPriceAdmin(it), 0)
  }

  async function submitAllOrders() {
    setError('')
    for (const dg of dateGroups) {
      for (const cg of dg.customerGroups) {
        if (cg.items.length === 0) continue
        let customerId = cg.customerId

        if (cg.isNew) {
          if (!cg.newPhone.trim() || !cg.newName.trim()) { setError('Lengkapi nomor HP dan nama customer baru.'); return }
          const { data: existing } = await supabase.from('customers').select('*').eq('phone', cg.newPhone.trim()).single()
          if (existing) customerId = existing.id
          else {
            const { data: newCust, error: custError } = await supabase.from('customers').insert({ phone: cg.newPhone.trim(), name: cg.newName.trim() }).select().single()
            if (custError) { setError('Gagal daftar customer baru: ' + cg.newPhone); return }
            customerId = newCust.id
          }
        }

        if (!customerId) { setError('Ada grup customer yang belum dipilih.'); return }

        const orderTotal = getCustomerGroupTotal(cg)
        const { data: customerData } = await supabase.from('customers').select('credit_balance').eq('id', customerId).single()
        const availableCredit = customerData?.credit_balance || 0
        const creditUsed = Math.min(availableCredit, orderTotal)
        if (creditUsed > 0) {
          await supabase.from('customers').update({ credit_balance: availableCredit - creditUsed }).eq('id', customerId)
        }
        const isPaid = creditUsed >= orderTotal

        const { data: order, error: orderError } = await supabase.from('orders').insert({
          customer_id: customerId,
          order_for_date: dg.date,
          credit_used: creditUsed,
          voided: false,
          paid: isPaid,
          paid_at: isPaid ? new Date().toISOString() : null
        }).select().single()
        if (orderError) { setError('Gagal membuat order.'); return }

        for (const it of cg.items) {
          const itemPrice = it.item.price + Object.values(it.selectedOptions).reduce((sum, c) => sum + (c?.price_addition || 0), 0)
          const { data: oi } = await supabase.from('order_items').insert({
            order_id: order.id, menu_item_id: it.item.id,
            menu_item_name: it.item.name, price_at_order: itemPrice, quantity: it.quantity
          }).select().single()
          const optionInserts = Object.entries(it.selectedOptions)
            .filter(([_, choice]) => choice !== null)
            .map(([groupId, choice]) => ({
              order_item_id: oi.id, option_group_id: groupId,
              option_group_name: it.item.optionGroups.find(og => og.id === groupId)?.name || '',
              option_choice_id: choice.id, option_choice_label: choice.label
            }))
          if (optionInserts.length > 0) await supabase.from('order_item_options').insert(optionInserts)
        }
      }
    }
    setDateGroups([])
    fetchAllUnpaid(); fetchAllCustomers(); fetchWorkOrders()
    alert('Semua order berhasil dibuat.')
  }

  async function savePaymentAccount() {
    if (!paForm.bank_name.trim() || !paForm.account_number.trim() || !paForm.account_name.trim()) { setError('Semua field rekening wajib diisi.'); return }
    setError('')
    const payload = { bank_name: paForm.bank_name.trim(), account_number: paForm.account_number.trim(), account_name: paForm.account_name.trim(), sort_order: parseInt(paForm.sort_order) || 0, active: true }
    if (editingPa) await supabase.from('payment_accounts').update(payload).eq('id', editingPa)
    else await supabase.from('payment_accounts').insert(payload)
    setPaForm({ bank_name: '', account_number: '', account_name: '', sort_order: 0 })
    setEditingPa(null); fetchPaymentAccounts()
  }

  async function deletePaymentAccount(id) {
    if (!window.confirm('Hapus rekening ini?')) return
    await supabase.from('payment_accounts').delete().eq('id', id)
    fetchPaymentAccounts()
  }

  async function saveClosedDay() {
    if (closedDayForm.type === 'specific' && !closedDayForm.specific_date) { setError('Pilih tanggal tutup.'); return }
    setError('')
    await supabase.from('closed_days').insert({
      type: closedDayForm.type,
      day_of_week: closedDayForm.type === 'recurring' ? parseInt(closedDayForm.day_of_week) : null,
      specific_date: closedDayForm.type === 'specific' ? closedDayForm.specific_date : null,
      note: closedDayForm.note || ''
    })
    setClosedDayForm({ type: 'recurring', day_of_week: 1, specific_date: '', note: '' })
    fetchClosedDays()
  }

  async function deleteClosedDay(id) {
    await supabase.from('closed_days').delete().eq('id', id)
    fetchClosedDays()
  }

  async function saveBatchSettings() {
    const today = new Date().toLocaleDateString('en-CA')
    const payload = {
      is_active: batchForm.is_active,
      open_hour: parseInt(batchForm.open_hour),
      open_minute: parseInt(batchForm.open_minute),
      close_hour: parseInt(batchForm.close_hour),
      close_minute: parseInt(batchForm.close_minute),
      shot_stock: parseInt(batchForm.shot_stock) || 0,
      batch_date: today
    }
    if (batchSettings) {
      await supabase.from('batch_settings').update(payload).eq('id', batchSettings.id)
    } else {
      await supabase.from('batch_settings').insert({ ...payload, shot_used: 0 })
    }
    fetchBatchSettings()
  }

  async function toggleBatchActive() {
    if (!batchSettings) {
      await saveBatchSettings()
      return
    }
    await supabase.from('batch_settings').update({ is_active: !batchSettings.is_active }).eq('id', batchSettings.id)
    fetchBatchSettings()
  }

  async function resetShotUsed() {
    if (!batchSettings) return
    if (!window.confirm('Reset stok shot terpakai ke 0?')) return
    await supabase.from('batch_settings').update({ shot_used: 0 }).eq('id', batchSettings.id)
    fetchBatchSettings()
  }

  function getWorkOrderGroups() {
    const map = {}
    const sourceOrders = workOrderView === 'langsung' ? langsungOrders : orders
    sourceOrders.forEach(o => {
      if (o.voided) return
      o.order_items.forEach(oi => {
        if (!map[oi.menu_item_name]) map[oi.menu_item_name] = []
        const subtotal = o.order_items.reduce((s, oi) => s + oi.price_at_order * oi.quantity, 0)
        const effectivePaid = o.paid || (o.credit_used || 0) + (o.promo_discount || 0) + (o.bonus_used || 0) + (o.manual_discount || 0) >= subtotal
        map[oi.menu_item_name].push({ customerName: o.customers?.name, customerPhone: o.customers?.phone, quantity: oi.quantity, options: oi.order_item_options, paid: o.paid, effectivePaid, transferClaimed: o.transfer_claimed, batchType: o.batch_type, orderId: o.id })
      })
    })
    return map
  }

  function getHistoryGroups() {
    const map = {}
    historyOrders.forEach(o => {
      o.order_items.forEach(oi => {
        if (!map[oi.menu_item_name]) map[oi.menu_item_name] = []
        const subtotal = o.order_items.reduce((s, oi) => s + oi.price_at_order * oi.quantity, 0)
        const effectivePaid = o.paid || (o.credit_used || 0) + (o.promo_discount || 0) + (o.bonus_used || 0) + (o.manual_discount || 0) >= subtotal
        map[oi.menu_item_name].push({ customerName: o.customers?.name, quantity: oi.quantity, options: oi.order_item_options, paid: o.paid, effectivePaid, transferClaimed: o.transfer_claimed, voided: o.voided })
      })
    })
    return map
  }

  async function togglePaid(orderId, currentPaid) {
    await supabase.from('orders').update({ paid: !currentPaid, paid_at: !currentPaid ? new Date().toISOString() : null, transfer_claimed: false }).eq('id', orderId)
    fetchWorkOrders()
    fetchLangsungOrders()
  }

  async function saveSettings() {
    await supabase.from('settings').upsert([
      { key: 'order_cutoff_hour', value: String(settingsForm.order_cutoff_hour) },
      { key: 'workorder_cutoff_hour', value: String(settingsForm.workorder_cutoff_hour) }
    ])
    const { data } = await supabase.from('settings').select('*')
    if (data) {
      const map = {}
      data.forEach(d => { map[d.key] = parseInt(d.value) })
      setSettings(map)
      setSettingsForm({ order_cutoff_hour: map.order_cutoff_hour, workorder_cutoff_hour: map.workorder_cutoff_hour })
    }
  }

  function resetMenuForm() {
    setMenuForm({ name: '', price: '', daily_limit: '', available_days: [0,1,2,3,4,5,6], active: true, sort_order: 0, image_url: '', batch2_eligible: false })
    setMenuFormGroups([])
    setEditingMenu(null)
  }

  function startEditMenu(item) {
    setEditingMenu(item.id)
    setMenuForm({ name: item.name, price: item.price, daily_limit: item.daily_limit || '', available_days: item.available_days || [0,1,2,3,4,5,6], active: item.active, sort_order: item.sort_order || 0, image_url: item.image_url || '', batch2_eligible: item.batch2_eligible || false })
    setMenuFormGroups(item.menu_item_option_groups.map(r => r.option_group_id))
    setTab('menu')
  }

  function toggleDay(day) {
    setMenuForm(f => ({ ...f, available_days: f.available_days.includes(day) ? f.available_days.filter(d => d !== day) : [...f.available_days, day] }))
  }

  async function saveMenu() {
    if (!menuForm.name.trim() || !menuForm.price) { setError('Nama dan harga wajib diisi.'); return }
    setError('')
    const payload = { name: menuForm.name.trim(), price: parseInt(menuForm.price), daily_limit: menuForm.daily_limit ? parseInt(menuForm.daily_limit) : null, available_days: menuForm.available_days, active: menuForm.active, sort_order: parseInt(menuForm.sort_order) || 0, image_url: menuForm.image_url || null, batch2_eligible: menuForm.batch2_eligible }
    let menuId = editingMenu
    if (editingMenu) {
      await supabase.from('menu_items').update(payload).eq('id', editingMenu)
      await supabase.from('menu_item_option_groups').delete().eq('menu_item_id', editingMenu)
    } else {
      const { data } = await supabase.from('menu_items').insert(payload).select().single()
      menuId = data.id
    }
    if (menuFormGroups.length > 0) await supabase.from('menu_item_option_groups').insert(menuFormGroups.map(gid => ({ menu_item_id: menuId, option_group_id: gid })))
    resetMenuForm(); fetchMenu()
  }

  async function deleteMenu(id) {
    if (!window.confirm('Hapus menu ini?')) return
    await supabase.from('menu_items').delete().eq('id', id)
    fetchMenu()
  }

  async function moveMenu(id, direction) {
    const idx = menuItems.findIndex(m => m.id === id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= menuItems.length) return
    const a = menuItems[idx], b = menuItems[swapIdx]
    await supabase.from('menu_items').update({ sort_order: swapIdx }).eq('id', a.id)
    await supabase.from('menu_items').update({ sort_order: idx }).eq('id', b.id)
    fetchMenu()
  }

  function resetOgForm() { setOgForm({ name: '', required: true, choices: [{ label: '', price_addition: 0 }] }); setEditingOg(null) }

  function startEditOg(og) {
    setEditingOg(og.id)
    setOgForm({ name: og.name, required: og.required, choices: og.option_choices.map(c => ({ label: c.label, price_addition: c.price_addition || 0 })) })
  }

  async function saveOg() {
    if (!ogForm.name.trim()) { setError('Nama grup wajib diisi.'); return }
    const validChoices = ogForm.choices.filter(c => c.label?.trim())
    if (validChoices.length === 0) { setError('Minimal 1 pilihan.'); return }
    setError('')
    let ogId = editingOg
    if (editingOg) {
      await supabase.from('option_groups').update({ name: ogForm.name, required: ogForm.required }).eq('id', editingOg)
      await supabase.from('option_choices').delete().eq('option_group_id', editingOg)
    } else {
      const { data, error: insertError } = await supabase.from('option_groups').insert({ name: ogForm.name, required: ogForm.required }).select().single()
      if (insertError || !data) { setError('Gagal simpan: ' + (insertError?.message || '')); return }
      ogId = data.id
    }
    await supabase.from('option_choices').insert(validChoices.map((c, i) => ({ option_group_id: ogId, label: c.label, price_addition: parseInt(c.price_addition) || 0, sort_order: i })))
    resetOgForm(); fetchOptionGroups()
  }

  async function deleteOg(id) {
    if (!window.confirm('Hapus grup opsi ini?')) return
    await supabase.from('option_groups').delete().eq('id', id)
    fetchOptionGroups()
  }

  function getStatusBadge(entry) {
    if (entry.voided) return { label: '✕ Void', bg: '#f0f0f0', color: '#888' }
    if (entry.effectivePaid || entry.paid) return { label: '✓ Lunas', bg: '#d4e8d8', color: '#1a3d2b' }
    if (entry.transferClaimed) return { label: '💸 Transfer', bg: '#fff3cd', color: '#856404' }
    return { label: '⏳ Belum', bg: '#fef3e2', color: '#e67e22' }
  }

  const totalToday = Object.values(dailyTotals).reduce((a, b) => a + Number(b), 0)
  const globalLimitNum = parseInt(globalLimitSaved) || null
  const overGlobalLimit = globalLimitNum && totalToday > globalLimitNum
  const workGroups = getWorkOrderGroups()
  const historyGroups = getHistoryGroups()

  return (
    <div style={st.container}>
      <div style={st.card}>
        <div style={st.header}>
          <img src="https://haixnqmapezjikgpwjqh.supabase.co/storage/v1/object/public/assets/kopi%20ijo.png"
            alt="Kopi Ijø" style={{ height: '80px', objectFit: 'contain' }} />
        </div>
        <div style={st.greeting}>
          <div style={st.greetingName}>Admin Panel ⚙️</div>
          <div style={st.greetingMsg}>Kelola menu, pantau order, dan tagihan di sini.</div>
        </div>
        {error && <p style={st.error}>{error}</p>}
        {loading && <p style={{ color: '#5a5248', padding: '8px 16px', fontSize: '13px' }}>Memuat...</p>}

        <div style={st.tabs}>
          {['workorder', 'history', 'billing', 'inputorder', 'menu', 'options', 'promo', 'payment', 'jadwal', 'batch2', 'settings'].map(t => (
            <button key={t} style={{ ...st.tab, ...(tab === t ? st.tabActive : {}) }}
              onClick={() => { setTab(t); if (t === 'history') fetchHistoryOrders(historyDate, historyFilter) }}>
              {{ workorder: '📋 Work Order', history: '📅 History', billing: '💰 Tagihan', inputorder: '➕ Input Order', menu: '☕ Menu', options: '🎛 Opsi', promo: '🏷 Promo', payment: '🏦 Rekening', jadwal: '🗓 Jadwal', batch2: '⚡ Order Langsung', settings: '⚙️ Setting' }[t]}
            </button>
          ))}
        </div>

        <div style={{ padding: '0 16px 24px' }}>

          {tab === 'workorder' && (
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button style={{ ...st.tab, flex: 1, ...(workOrderView === 'po' ? st.tabActive : {}) }} onClick={() => setWorkOrderView('po')}>
                  📅 Pre-Order
                </button>
                <button style={{ ...st.tab, flex: 1, ...(workOrderView === 'langsung' ? st.tabActive : {}) }} onClick={() => setWorkOrderView('langsung')}>
                  ⚡ Order Langsung (Hari Ini)
                </button>
              </div>
              <div style={st.summaryBox}>
                <strong style={{ color: '#1a3d2b' }}>Work Order</strong>
                <div style={{ fontSize: '13px', color: '#1a3d2b', marginTop: '2px' }}>
                  Delivery: <strong>{workOrderView === 'langsung' ? formatTimestamp(new Date().toISOString()).split(' · ')[0] : workDateLabel}</strong>
                </div>
                <div style={{ fontSize: '13px', color: '#5a5248', marginTop: '4px' }}>
                  Total terjual hari ini: <strong>{totalToday} item</strong>
                  {overGlobalLimit && <span style={{ color: '#c0392b', marginLeft: '8px' }}>⚠️ Melebihi limit ({globalLimitSaved})</span>}
                </div>
                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', color: '#5a5248' }}>Limit total harian (warning):</span>
                  <input style={{ ...st.input, width: '70px', marginBottom: 0 }} type="number" value={globalLimit}
                    onChange={e => setGlobalLimit(e.target.value)} placeholder={globalLimitSaved || '—'} />
                  <button style={st.btnSmall} onClick={() => { localStorage.setItem('globalDailyLimit', globalLimit); setGlobalLimitSaved(globalLimit) }}>Simpan</button>
                </div>
              </div>
              {Object.keys(workGroups).length === 0 && <p style={{ color: '#5a5248' }}>Belum ada order.</p>}
              {Object.entries(workGroups).map(([menuName, entries]) => (
                <div key={menuName} style={st.workCard}>
                  <div style={st.workCardHeader}>
                    <strong>{menuName}</strong>
                    <span style={st.countBadge}>{entries.reduce((sum, e) => sum + e.quantity, 0)} cup</span>
                  </div>
                  {entries.map((entry, i) => {
                    const badge = getStatusBadge(entry)
                    return (
                      <div key={i} style={{ ...st.workEntry, ...(entry.batchType === 'batch2' ? { borderLeft: '4px solid #e67e22', background: '#fff8f0' } : {}) }}>
                        <div style={{ ...st.workEntryRow, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                            {entry.batchType === 'batch2' && (
                              <span style={{ display: 'inline-block', background: '#e67e22', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '10px', marginBottom: '4px', fontWeight: '500' }}>
                                ⚡ LANGSUNG
                              </span>
                            )}
                            <div>
                              <span style={{ fontSize: '13px', fontWeight: '500', color: '#2c2c2a' }}>
                                {entry.quantity > 1 ? `${entry.quantity}x ` : ''}{entry.customerName}
                              </span>
                              <span style={{ fontSize: '12px', color: '#888', marginLeft: '6px' }}>{entry.customerPhone}</span>
                            </div>
                            {entry.options.length > 0 && (
                              <div style={st.optionTags}>
                                {entry.options.map(opt => (
                                  <span key={opt.id} style={st.tag}>{opt.option_group_name}: {opt.option_choice_label}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                            <span style={{ ...st.badge, background: badge.bg, color: badge.color }}>{badge.label}</span>
                            <button style={{ ...st.btnSmall, background: entry.effectivePaid ? '#2d7a4f' : '#e67e22', minWidth: '90px' }}
                              onClick={() => togglePaid(entry.orderId, entry.paid)}>
                              {entry.effectivePaid ? '✓ Konfirmasi' : 'Tandai Lunas'}
                            </button>
                            <button style={{ ...st.btnSmall, background: '#c0392b', minWidth: '90px' }}
                              onClick={() => voidOrder(entry.orderId)}>
                              Void
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {tab === 'history' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  <button style={{ ...st.btnSmall, background: historyFilter === 'untuk' ? '#1a3d2b' : '#d6cfc4', color: historyFilter === 'untuk' ? '#fff' : '#5a5248' }}
                    onClick={() => { setHistoryFilter('untuk'); fetchHistoryOrders(historyDate, 'untuk') }}>Tanggal Delivery</button>
                  <button style={{ ...st.btnSmall, background: historyFilter === 'pesan' ? '#1a3d2b' : '#d6cfc4', color: historyFilter === 'pesan' ? '#fff' : '#5a5248' }}
                    onClick={() => { setHistoryFilter('pesan'); fetchHistoryOrders(historyDate, 'pesan') }}>Tanggal Pesan</button>
                </div>
                <input style={st.input} type="date" value={historyDate}
                  onChange={e => { setHistoryDate(e.target.value); fetchHistoryOrders(e.target.value, historyFilter) }} />
              </div>
              {Object.keys(historyGroups).length === 0 && <p style={{ color: '#5a5248' }}>Tidak ada order di tanggal ini.</p>}
              {Object.entries(historyGroups).map(([menuName, entries]) => (
                <div key={menuName} style={st.workCard}>
                  <div style={st.workCardHeader}>
                    <strong>{menuName}</strong>
                    <span style={st.countBadge}>{entries.filter(e => !e.voided).reduce((sum, e) => sum + e.quantity, 0)} cup</span>
                  </div>
                  {entries.map((entry, i) => {
                    const badge = getStatusBadge(entry)
                    return (
                      <div key={i} style={{ ...st.workEntry, opacity: entry.voided ? 0.5 : 1 }}>
                        <div style={st.workEntryRow}>
                          <div>
                            <span style={{ fontSize: '13px', fontWeight: '500', color: '#2c2c2a', textDecoration: entry.voided ? 'line-through' : 'none' }}>
                              {entry.quantity > 1 ? `${entry.quantity}x ` : ''}{entry.customerName}
                            </span>
                            {entry.options.length > 0 && (
                              <div style={st.optionTags}>
                                {entry.options.map(opt => (
                                  <span key={opt.id} style={st.tag}>{opt.option_group_name}: {opt.option_choice_label}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <span style={{ ...st.badge, background: badge.bg, color: badge.color }}>{badge.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {tab === 'billing' && (
            <div>
              <h3 style={{ color: '#1a3d2b', marginBottom: '12px' }}>Tagihan & Credit</h3>
              {allCustomers.map(customer => {
                const unpaidOrders = allUnpaidOrders.filter(o => o.customers?.phone === customer.phone)
                const unpaidTotal = unpaidOrders.reduce((sum, o) => {
                  const subtotal = o.order_items.reduce((s, oi) => s + oi.price_at_order * oi.quantity, 0)
                  return sum + subtotal - (o.promo_discount || 0) - (o.bonus_used || 0) - (o.credit_used || 0) - (o.manual_discount || 0)
                }, 0)
                const hasTransferClaim = unpaidOrders.some(o => o.transfer_claimed)
                return (
                  <div key={customer.id} style={{ ...st.itemCard, marginBottom: '10px', borderColor: hasTransferClaim ? '#856404' : '#d6cfc4', borderWidth: hasTransferClaim ? '1.5px' : '0.5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div>
                        <strong style={{ color: '#2c2c2a' }}>{customer.name}</strong>
                        <div style={{ fontSize: '12px', color: '#888' }}>{customer.phone}</div>
                        {hasTransferClaim && <div style={{ fontSize: '12px', color: '#856404', marginTop: '4px', fontWeight: '500' }}>💸 Klaim sudah transfer</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#1a3d2b' }}>Credit: <strong>Rp {(customer.credit_balance || 0).toLocaleString('id-ID')}</strong></div>
                        {customer.bonus_balance > 0 && <div style={{ fontSize: '12px', color: '#e67e22' }}>Bonus: <strong>Rp {customer.bonus_balance.toLocaleString('id-ID')}</strong></div>}
                        {unpaidTotal > 0 && <div style={{ fontSize: '12px', color: '#c0392b' }}>Tagihan: <strong>Rp {unpaidTotal.toLocaleString('id-ID')}</strong></div>}
                        {unpaidTotal <= 0 && <div style={{ fontSize: '12px', color: '#1a3d2b' }}>✓ Lunas</div>}
                      </div>
                    </div>
                    <div style={{ borderTop: '0.5px solid #d6cfc4', paddingTop: '10px', marginBottom: '8px' }}>
                      <div style={{ fontSize: '12px', color: '#5a5248', marginBottom: '6px' }}>Top-up Credit:</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <input style={{ ...st.input, marginBottom: 0, flex: 1, minWidth: '80px' }} type="number" placeholder="Jumlah (Rp)"
                          value={topUpAmount[customer.phone] || ''} onChange={e => setTopUpAmount(prev => ({ ...prev, [customer.phone]: e.target.value }))} />
                        <input style={{ ...st.input, marginBottom: 0, flex: 2, minWidth: '100px' }} type="text" placeholder="Catatan (opsional)"
                          value={topUpNote[customer.phone] || ''} onChange={e => setTopUpNote(prev => ({ ...prev, [customer.phone]: e.target.value }))} />
                        <button style={{ ...st.btnSmall, background: '#1a3d2b' }} onClick={() => handleTopUp(customer.id, customer.phone)}>+ Credit</button>
                      </div>
                    </div>
                    <div style={{ borderTop: '0.5px solid #d6cfc4', paddingTop: '10px', marginBottom: '8px' }}>
                      <div style={{ fontSize: '12px', color: '#5a5248', marginBottom: '6px' }}>Beri Bonus (subsidi, bukan cash):</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <input style={{ ...st.input, marginBottom: 0, flex: 1, minWidth: '80px' }} type="number" placeholder="Jumlah (Rp)"
                          value={bonusAmount[customer.phone] || ''} onChange={e => setBonusAmount(prev => ({ ...prev, [customer.phone]: e.target.value }))} />
                        <input style={{ ...st.input, marginBottom: 0, flex: 2, minWidth: '100px' }} type="text" placeholder="Alasan (opsional)"
                          value={bonusNote[customer.phone] || ''} onChange={e => setBonusNote(prev => ({ ...prev, [customer.phone]: e.target.value }))} />
                        <button style={{ ...st.btnSmall, background: '#e67e22' }} onClick={() => handleBonusGive(customer.id, customer.phone)}>+ Bonus</button>
                      </div>
                    </div>
                    <div style={{ borderTop: '0.5px solid #d6cfc4', paddingTop: '10px', marginBottom: '8px' }}>
                      <div style={{ fontSize: '12px', color: '#5a5248', marginBottom: '6px' }}>Tagihan Manual:</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <input style={{ ...st.input, marginBottom: 0, flex: 1, minWidth: '80px' }} type="number" placeholder="Jumlah (Rp)"
                          value={manualBillAmount[customer.phone] || ''} onChange={e => setManualBillAmount(prev => ({ ...prev, [customer.phone]: e.target.value }))} />
                        <input style={{ ...st.input, marginBottom: 0, flex: 2, minWidth: '100px' }} type="text" placeholder="Keterangan"
                          value={manualBillNote[customer.phone] || ''} onChange={e => setManualBillNote(prev => ({ ...prev, [customer.phone]: e.target.value }))} />
                      </div>
                      <label style={{ ...st.checkRow, marginTop: '8px', fontSize: '12px' }}>
                        <input type="checkbox" checked={manualBillUseCredit[customer.phone] ?? true}
                          onChange={e => setManualBillUseCredit(prev => ({ ...prev, [customer.phone]: e.target.checked }))} />
                        Potong credit otomatis
                      </label>
                      <button style={{ ...st.btnSmall, background: '#c0392b', marginTop: '4px' }} onClick={() => handleManualBill(customer.id, customer.phone)}>+ Tagihan</button>
                    </div>
                    {(() => {
                      const allOrders = allUnpaidOrders.filter(o => o.customers?.phone === customer.phone)
                      if (allOrders.length === 0) return null
                      return (
                        <div style={{ borderTop: '0.5px solid #d6cfc4', paddingTop: '10px' }}>
                          {allOrders.map(o => {
                            const subtotal = o.order_items.reduce((s, oi) => s + oi.price_at_order * oi.quantity, 0)
                            const sisaTagihan = Math.max(0, subtotal - (o.promo_discount || 0) - (o.bonus_used || 0) - (o.credit_used || 0) - (o.manual_discount || 0))
                            const lunasByCredit = !o.paid && sisaTagihan === 0
                            const statusColor = o.paid ? '#1a3d2b' : lunasByCredit ? '#2d7a4f' : o.transfer_claimed ? '#856404' : '#e67e22'
                            const statusLabel = o.paid ? '✓ Lunas' : lunasByCredit ? '✓ Lunas (Credit)' : o.transfer_claimed ? '💸 Klaim Transfer' : '⏳ Belum Bayar'
                            const statusBg = o.paid || lunasByCredit ? '#d4e8d8' : o.transfer_claimed ? '#fff3cd' : '#fef3e2'
                            return (
                              <div key={o.id} style={{ marginBottom: '12px', background: '#fff', borderRadius: '8px', padding: '10px', border: `1.5px solid ${statusColor}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <div>
                                    <div style={{ fontSize: '12px', color: '#888' }}>Pesan: {formatTimestamp(o.created_at)}</div>
                                    <div style={{ fontSize: '12px', color: '#1a3d2b', fontWeight: '500' }}>
                                      Delivery: {o.order_for_date ? new Date(o.order_for_date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                      {o.batch_type === 'batch2' && <span style={{ color: '#e67e22', marginLeft: '6px' }}>⚡ Langsung</span>}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <span style={{ background: statusBg, color: statusColor, padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>{statusLabel}</span>
                                    <button style={{ ...st.btnSmall, background: '#c0392b', padding: '3px 8px', fontSize: '11px' }} onClick={() => voidOrder(o.id)}>Void</button>
                                  </div>
                                </div>
                                {o.order_items.map(oi => (
                                  <div key={oi.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#2c2c2a', padding: '2px 0' }}>
                                    <span>{oi.quantity}x {oi.menu_item_name}</span>
                                    <span>Rp {(oi.price_at_order * oi.quantity).toLocaleString('id-ID')}</span>
                                  </div>
                                ))}
                                <div style={{ borderTop: '0.5px solid #eee', marginTop: '6px', paddingTop: '6px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#5a5248' }}>
                                    <span>Subtotal</span><span>Rp {subtotal.toLocaleString('id-ID')}</span>
                                  </div>
                                  {o.promo_discount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#e67e22' }}>
                                      <span>🏷 Diskon Promo</span><span>- Rp {o.promo_discount.toLocaleString('id-ID')}</span>
                                    </div>
                                  )}
                                  {o.bonus_used > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#e67e22' }}>
                                      <span>🎁 Bonus dipakai</span><span>- Rp {o.bonus_used.toLocaleString('id-ID')}</span>
                                    </div>
                                  )}
                                  {o.bonus_used > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#e67e22' }}>
                                      <span>🎁 Bonus dipakai</span><span>- Rp {o.bonus_used.toLocaleString('id-ID')}</span>
                                    </div>
                                  )}
                                  {o.credit_used > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#1a3d2b' }}>
                                      <span>Credit dipakai</span><span>- Rp {o.credit_used.toLocaleString('id-ID')}</span>
                                    </div>
                                  )}
                                  {o.manual_discount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9b59b6' }}>
                                      <span>✂️ Potongan Manual</span><span>- Rp {o.manual_discount.toLocaleString('id-ID')}</span>
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold', color: statusColor, marginTop: '4px' }}>
                                    <span>Sisa Tagihan</span><span>Rp {sisaTagihan.toLocaleString('id-ID')}</span>
                                  </div>
                                  {!o.paid && sisaTagihan > 0 && (
                                    <>
                                      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                                        <input style={{ ...st.input, marginBottom: 0, flex: 1 }} type="number" placeholder="Potongan manual (Rp)"
                                          value={manualDiscountAmount[o.id] || ''}
                                          onChange={e => setManualDiscountAmount(prev => ({ ...prev, [o.id]: e.target.value }))} />
                                        <button style={{ ...st.btnSmall, background: '#9b59b6' }}
                                          onClick={() => applyManualDiscount(o.id, customer.id, customer.phone)}>
                                          Potong
                                        </button>
                                      </div>
                                      <button style={{ ...st.btnSmall, background: '#2d7a4f', width: '100%', marginTop: '6px' }}
                                        onClick={async () => {
                                          await supabase.from('orders').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', o.id)
                                          fetchAllUnpaid(); fetchAllCustomers()
                                        }}>
                                        Tandai Lunas
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                          {allOrders.some(o => !o.paid && Math.max(0, o.order_items.reduce((s, oi) => s + oi.price_at_order * oi.quantity, 0) - (o.credit_used || 0)) > 0) && (
                            <button style={{ ...st.btnSmall, background: '#2d7a4f', width: '100%', marginTop: '6px' }}
                              onClick={async () => {
                                for (const o of allOrders) await supabase.from('orders').update({ paid: true, paid_at: new Date().toISOString(), transfer_claimed: false }).eq('id', o.id)
                                fetchAllUnpaid(); fetchAllCustomers()
                              }}>Tandai Semua Lunas</button>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'menu' && (
            <div>
              <div style={st.sectionBox}>
                <h3 style={{ color: '#1a3d2b', marginBottom: '12px' }}>{editingMenu ? 'Edit Menu' : 'Tambah Menu'}</h3>
                <input style={st.input} placeholder="Nama menu" value={menuForm.name} onChange={e => setMenuForm(f => ({ ...f, name: e.target.value }))} />
                <input style={st.input} placeholder="Harga (Rp)" type="number" value={menuForm.price} onChange={e => setMenuForm(f => ({ ...f, price: e.target.value }))} />
                <input style={st.input} placeholder="Limit per hari (kosongkan = tidak ada limit)" type="number" value={menuForm.daily_limit} onChange={e => setMenuForm(f => ({ ...f, daily_limit: e.target.value }))} />
                <input style={st.input} placeholder="Urutan tampil (angka kecil = duluan)" type="number" value={menuForm.sort_order} onChange={e => setMenuForm(f => ({ ...f, sort_order: e.target.value }))} />
                <label style={st.label}>Foto menu (opsional):</label>
                {menuForm.image_url && (
                  <div style={{ marginBottom: '10px' }}>
                    <img src={menuForm.image_url} alt="preview" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: '8px' }} />
                    <button style={{ ...st.btnOutline, marginTop: '6px', fontSize: '12px', padding: '6px' }} onClick={() => setMenuForm(f => ({ ...f, image_url: '' }))}>Hapus Foto</button>
                  </div>
                )}
                <input style={{ ...st.input, padding: '6px' }} type="file" accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files[0]
                    if (!file) return
                    const ext = file.name.split('.').pop()
                    const fileName = `menu-${Date.now()}.${ext}`
                    const { error } = await supabase.storage.from('menu-images').upload(fileName, file, { upsert: true })
                    if (error) { setError('Gagal upload foto.'); return }
                    const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(fileName)
                    setMenuForm(f => ({ ...f, image_url: urlData.publicUrl }))
                  }} />
                <label style={st.label}>Tersedia hari:</label>
                <div style={st.dayRow}>
                  {DAYS.map((d, i) => (
                    <button key={i} style={{ ...st.dayBtn, ...(menuForm.available_days.includes(i) ? st.dayBtnActive : {}) }} onClick={() => toggleDay(i)}>{d.slice(0, 3)}</button>
                  ))}
                </div>
                <label style={{ ...st.label, marginTop: '12px' }}>Grup opsi:</label>
                {optionGroups.map(og => (
                  <label key={og.id} style={st.checkRow}>
                    <input type="checkbox" checked={menuFormGroups.includes(og.id)}
                      onChange={e => setMenuFormGroups(prev => e.target.checked ? [...prev, og.id] : prev.filter(id => id !== og.id))} />
                    {' '}{og.name}
                  </label>
                ))}
                {optionGroups.length === 0 && <p style={{ fontSize: '13px', color: '#888' }}>Belum ada grup opsi.</p>}
                <label style={{ ...st.checkRow, marginTop: '4px' }}>
                  <input type="checkbox" checked={menuForm.batch2_eligible || false} onChange={e => setMenuForm(f => ({ ...f, batch2_eligible: e.target.checked }))} />
                  {' '}⚡ Tersedia di Order Langsung
                </label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button style={st.btn} onClick={saveMenu}>{editingMenu ? 'Update Menu' : 'Simpan Menu'}</button>
                  {editingMenu && <button style={st.btnOutline} onClick={resetMenuForm}>Batal</button>}
                </div>
              </div>
              <h3 style={{ color: '#1a3d2b', margin: '20px 0 12px' }}>Daftar Menu</h3>
              {menuItems.map((item, idx) => (
                <div key={item.id} style={{ ...st.itemCard, opacity: item.active ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <strong style={{ color: '#2c2c2a' }}>{item.name}</strong>
                      <div style={{ fontSize: '12px', color: '#5a5248', marginTop: '3px' }}>
                        Rp {item.price.toLocaleString('id-ID')}
                        {item.daily_limit && ` · Limit: ${item.daily_limit}/hari`}
                        {` · Terjual: ${dailyTotals[item.id] || 0}`}
                        {!item.active && ' · [nonaktif]'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{item.available_days?.map(d => DAYS[d]).join(', ')}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button style={st.btnSmall} onClick={() => moveMenu(item.id, 'up')} disabled={idx === 0}>↑</button>
                      <button style={st.btnSmall} onClick={() => moveMenu(item.id, 'down')} disabled={idx === menuItems.length - 1}>↓</button>
                      <button style={st.btnSmall} onClick={() => startEditMenu(item)}>Edit</button>
                      <button style={{ ...st.btnSmall, background: '#c0392b' }} onClick={() => deleteMenu(item.id)}>Hapus</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'options' && (
            <div>
              <div style={st.sectionBox}>
                <h3 style={{ color: '#1a3d2b', marginBottom: '12px' }}>{editingOg ? 'Edit Grup Opsi' : 'Tambah Grup Opsi'}</h3>
                <input style={st.input} placeholder="Nama grup (misal: Tingkat Gula)" value={ogForm.name} onChange={e => setOgForm(f => ({ ...f, name: e.target.value }))} />
                <label style={st.checkRow}>
                  <input type="checkbox" checked={ogForm.required} onChange={e => setOgForm(f => ({ ...f, required: e.target.checked }))} />
                  {' '}Wajib dipilih
                </label>
                <label style={st.label}>Pilihan:</label>
                {ogForm.choices.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                    <input style={{ ...st.input, marginBottom: 0, flex: 2 }} placeholder={`Pilihan ${i + 1}`} value={c.label}
                      onChange={e => setOgForm(f => ({ ...f, choices: f.choices.map((ch, j) => j === i ? { ...ch, label: e.target.value } : ch) }))} />
                    <input style={{ ...st.input, marginBottom: 0, flex: 1 }} placeholder="Harga tambah" type="number" value={c.price_addition || ''}
                      onChange={e => setOgForm(f => ({ ...f, choices: f.choices.map((ch, j) => j === i ? { ...ch, price_addition: e.target.value } : ch) }))} />
                    {ogForm.choices.length > 1 && (
                      <button style={st.btnRemove} onClick={() => setOgForm(f => ({ ...f, choices: f.choices.filter((_, j) => j !== i) }))}>✕</button>
                    )}
                  </div>
                ))}
                <button style={st.btnOutline} onClick={() => setOgForm(f => ({ ...f, choices: [...f.choices, { label: '', price_addition: 0 }] }))}>+ Tambah Pilihan</button>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button style={st.btn} onClick={saveOg}>{editingOg ? 'Update' : 'Simpan'}</button>
                  {editingOg && <button style={st.btnOutline} onClick={resetOgForm}>Batal</button>}
                </div>
              </div>
              <h3 style={{ color: '#1a3d2b', margin: '20px 0 12px' }}>Daftar Grup Opsi</h3>
              {optionGroups.map(og => (
                <div key={og.id} style={st.itemCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <strong style={{ color: '#2c2c2a' }}>{og.name}</strong>
                      <span style={{ fontSize: '12px', color: '#888', marginLeft: '6px' }}>{og.required ? 'Wajib' : 'Opsional'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button style={st.btnSmall} onClick={() => startEditOg(og)}>Edit</button>
                      <button style={{ ...st.btnSmall, background: '#c0392b' }} onClick={() => deleteOg(og.id)}>Hapus</button>
                    </div>
                  </div>
                  <div style={st.optionTags}>
                    {og.option_choices.sort((a, b) => a.sort_order - b.sort_order).map(c => (
                      <span key={c.id} style={st.tag}>{c.label}{c.price_addition > 0 ? ` +Rp ${c.price_addition.toLocaleString('id-ID')}` : ''}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'payment' && (
            <div>
              <div style={st.sectionBox}>
                <h3 style={{ color: '#1a3d2b', marginBottom: '12px' }}>{editingPa ? 'Edit Rekening' : 'Tambah Rekening'}</h3>
                <input style={st.input} placeholder="Nama Bank (misal: BCA, Mandiri, QRIS)" value={paForm.bank_name} onChange={e => setPaForm(f => ({ ...f, bank_name: e.target.value }))} />
                <input style={st.input} placeholder="Nomor Rekening / Nomor QRIS" value={paForm.account_number} onChange={e => setPaForm(f => ({ ...f, account_number: e.target.value }))} />
                <input style={st.input} placeholder="Nama Pemilik Rekening" value={paForm.account_name} onChange={e => setPaForm(f => ({ ...f, account_name: e.target.value }))} />
                <input style={st.input} placeholder="Urutan tampil" type="number" value={paForm.sort_order} onChange={e => setPaForm(f => ({ ...f, sort_order: e.target.value }))} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={st.btn} onClick={savePaymentAccount}>{editingPa ? 'Update' : 'Simpan'}</button>
                  {editingPa && <button style={st.btnOutline} onClick={() => { setPaForm({ bank_name: '', account_number: '', account_name: '', sort_order: 0 }); setEditingPa(null) }}>Batal</button>}
                </div>
              </div>
              <h3 style={{ color: '#1a3d2b', margin: '20px 0 12px' }}>Daftar Rekening</h3>
              {paymentAccounts.length === 0 && <p style={{ color: '#5a5248' }}>Belum ada rekening.</p>}
              {paymentAccounts.map(pa => (
                <div key={pa.id} style={st.itemCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ color: '#2c2c2a' }}>{pa.bank_name}</strong>
                      <div style={{ fontSize: '13px', color: '#1a3d2b', marginTop: '2px', fontWeight: '500' }}>{pa.account_number}</div>
                      <div style={{ fontSize: '12px', color: '#5a5248' }}>{pa.account_name}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button style={st.btnSmall} onClick={() => { setEditingPa(pa.id); setPaForm({ bank_name: pa.bank_name, account_number: pa.account_number, account_name: pa.account_name, sort_order: pa.sort_order }) }}>Edit</button>
                      <button style={{ ...st.btnSmall, background: '#c0392b' }} onClick={() => deletePaymentAccount(pa.id)}>Hapus</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'jadwal' && (
            <div>
              <div style={st.sectionBox}>
                <h3 style={{ color: '#1a3d2b', marginBottom: '12px' }}>Tambah Hari Tutup</h3>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  {[['recurring', 'Mingguan'], ['specific', 'Tanggal Tertentu']].map(([v, label]) => (
                    <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer' }}>
                      <input type="radio" name="closedType" value={v} checked={closedDayForm.type === v}
                        onChange={() => setClosedDayForm(f => ({ ...f, type: v }))} />
                      {label}
                    </label>
                  ))}
                </div>
                {closedDayForm.type === 'recurring' && (
                  <select style={st.input} value={closedDayForm.day_of_week}
                    onChange={e => setClosedDayForm(f => ({ ...f, day_of_week: e.target.value }))}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                )}
                {closedDayForm.type === 'specific' && (
                  <input style={st.input} type="date" value={closedDayForm.specific_date}
                    onChange={e => setClosedDayForm(f => ({ ...f, specific_date: e.target.value }))} />
                )}
                <input style={st.input} placeholder="Catatan (opsional)" value={closedDayForm.note}
                  onChange={e => setClosedDayForm(f => ({ ...f, note: e.target.value }))} />
                <button style={st.btn} onClick={saveClosedDay}>Simpan</button>
              </div>
              <h3 style={{ color: '#1a3d2b', margin: '20px 0 12px' }}>Daftar Hari Tutup</h3>
              {closedDays.length === 0 && <p style={{ color: '#5a5248' }}>Belum ada hari tutup.</p>}
              {closedDays.map(cd => (
                <div key={cd.id} style={{ ...st.itemCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: '#2c2c2a', fontSize: '13px' }}>
                      {cd.type === 'recurring' ? `Setiap ${DAYS[cd.day_of_week]}` : new Date(cd.specific_date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                    </strong>
                    {cd.note && <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{cd.note}</div>}
                  </div>
                  <button style={{ ...st.btnSmall, background: '#c0392b' }} onClick={() => deleteClosedDay(cd.id)}>Hapus</button>
                </div>
              ))}
            </div>
          )}

          {tab === 'inputorder' && (
            <div>
              <h3 style={{ color: '#1a3d2b', marginBottom: '12px' }}>Input Order untuk Customer</h3>

              {dateGroups.map(dg => (
                <div key={dg.id} style={{ ...st.sectionBox, border: '1.5px solid #1a3d2b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <input style={{ ...st.input, marginBottom: 0, width: '180px' }} type="date" value={dg.date}
                      onChange={e => updateDateGroupDate(dg.id, e.target.value)} />
                    <button style={{ ...st.btnSmall, background: '#c0392b' }} onClick={() => removeDateGroup(dg.id)}>Hapus Tanggal</button>
                  </div>

                  {dg.customerGroups.map(cg => (
                    <div key={cg.id} style={{ background: '#fff', border: '0.5px solid #d6cfc4', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ ...st.checkRow, marginBottom: 0 }}>
                          <input type="checkbox" checked={cg.isNew}
                            onChange={e => updateCustomerGroup(dg.id, cg.id, { isNew: e.target.checked, customerId: '' })} />
                          Customer baru
                        </label>
                        <button style={st.btnRemove} onClick={() => removeCustomerGroup(dg.id, cg.id)}>✕</button>
                      </div>

                      {cg.isNew ? (
                        <>
                          <input style={st.input} placeholder="Nomor HP" value={cg.newPhone}
                            onChange={e => updateCustomerGroup(dg.id, cg.id, { newPhone: e.target.value })} />
                          <input style={st.input} placeholder="Nama" value={cg.newName}
                            onChange={e => updateCustomerGroup(dg.id, cg.id, { newName: e.target.value })} />
                        </>
                      ) : (
                        <select style={st.input} value={cg.customerId}
                          onChange={e => updateCustomerGroup(dg.id, cg.id, { customerId: e.target.value })}>
                          <option value="">-- Pilih Customer --</option>
                          {allCustomers.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                          ))}
                        </select>
                      )}

                      <div style={{ marginTop: '8px' }}>
                        <select style={st.input} value="" onChange={e => {
                          const item = adminMenuFull.find(m => m.id === e.target.value)
                          if (item) addItemToCustomerGroup(dg.id, cg.id, item)
                        }}>
                          <option value="">+ Tambah menu...</option>
                          {adminMenuFull.map(item => (
                            <option key={item.id} value={item.id}>{item.name} - Rp {item.price.toLocaleString('id-ID')}</option>
                          ))}
                        </select>
                      </div>

                      {cg.items.map(it => (
                        <div key={it.cartId} style={{ background: '#f7f3ee', borderRadius: '6px', padding: '8px', marginTop: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '12px', color: '#2c2c2a' }}>{it.item.name}</strong>
                            <button style={st.btnRemove} onClick={() => removeItem(dg.id, cg.id, it.cartId)}>✕</button>
                          </div>
                          {it.item.optionGroups.map(og => (
                            <div key={og.id} style={{ marginTop: '4px' }}>
                              <span style={{ fontSize: '11px', color: '#5a5248' }}>{og.name}:</span>
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px' }}>
                                {!og.required && (
                                  <button style={{ ...st.dayBtn, padding: '3px 7px', fontSize: '11px', ...(!it.selectedOptions[og.id] ? st.dayBtnActive : {}) }}
                                    onClick={() => updateItemOption(dg.id, cg.id, it.cartId, og.id, null)}>Tidak ada</button>
                                )}
                                {og.choices.map(choice => (
                                  <button key={choice.id}
                                    style={{ ...st.dayBtn, padding: '3px 7px', fontSize: '11px', ...(it.selectedOptions[og.id]?.id === choice.id ? st.dayBtnActive : {}) }}
                                    onClick={() => updateItemOption(dg.id, cg.id, it.cartId, og.id, choice)}>{choice.label}</button>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                            <button style={{ ...st.btnSmall, padding: '4px 10px' }} onClick={() => updateItemQty(dg.id, cg.id, it.cartId, -1)}>−</button>
                            <span style={{ fontSize: '12px' }}>{it.quantity}</span>
                            <button style={{ ...st.btnSmall, padding: '4px 10px' }} onClick={() => updateItemQty(dg.id, cg.id, it.cartId, 1)}>+</button>
                            <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 'bold', color: '#1a3d2b' }}>
                              Rp {getItemPriceAdmin(it).toLocaleString('id-ID')}
                            </span>
                          </div>
                        </div>
                      ))}

                      {cg.items.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '0.5px solid #d6cfc4', fontSize: '13px' }}>
                          <strong>Subtotal</strong>
                          <strong style={{ color: '#1a3d2b' }}>Rp {getCustomerGroupTotal(cg).toLocaleString('id-ID')}</strong>
                        </div>
                      )}
                    </div>
                  ))}

                  <button style={st.btnOutline} onClick={() => addCustomerGroup(dg.id)}>+ Tambah Customer untuk Tanggal Ini</button>
                </div>
              ))}

              <button style={st.btn} onClick={addDateGroup}>+ Tambah Tanggal</button>

              {dateGroups.length > 0 && dateGroups.some(dg => dg.customerGroups.some(cg => cg.items.length > 0)) && (
                <button style={{ ...st.btn, background: '#2d7a4f', marginTop: '16px' }} onClick={submitAllOrders}>
                  Buat Semua Order
                </button>
              )}
            </div>
          )}

          {tab === 'promo' && (
            <div>
              <div style={st.sectionBox}>
                <h3 style={{ color: '#1a3d2b', marginBottom: '12px' }}>{editingPromo ? 'Edit Promo' : 'Tambah Promo'}</h3>
                <input style={st.input} placeholder="Nama promo" value={promoForm.name}
                  onChange={e => setPromoForm(f => ({ ...f, name: e.target.value }))} />

                <label style={st.label}>Jenis Promo:</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  {[['overall', 'Overall Transaksi'], ['product', 'Per Produk']].map(([v, label]) => (
                    <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer' }}>
                      <input type="radio" name="promoType" value={v} checked={promoForm.type === v}
                        onChange={() => setPromoForm(f => ({ ...f, type: v }))} />
                      {label}
                    </label>
                  ))}
                </div>

                {promoForm.type === 'product' && (
                  <select style={st.input} value={promoForm.menu_item_id}
                    onChange={e => setPromoForm(f => ({ ...f, menu_item_id: e.target.value }))}>
                    <option value="">-- Pilih Menu --</option>
                    {menuItems.map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                )}

                <label style={st.label}>Tipe Diskon:</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  {[['percent', 'Persen (%)'], ['value', 'Nominal (Rp)']].map(([v, label]) => (
                    <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer' }}>
                      <input type="radio" name="discountType" value={v} checked={promoForm.discount_type === v}
                        onChange={() => setPromoForm(f => ({ ...f, discount_type: v }))} />
                      {label}
                    </label>
                  ))}
                </div>

                <input style={st.input} type="number" placeholder={promoForm.discount_type === 'percent' ? 'Persen diskon (misal: 20)' : 'Nominal diskon (Rp)'}
                  value={promoForm.discount_amount} onChange={e => setPromoForm(f => ({ ...f, discount_amount: e.target.value }))} />

                <label style={st.label}>Periode Promo:</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input style={{ ...st.input, marginBottom: 0, flex: 1 }} type="date" value={promoForm.start_date}
                    onChange={e => setPromoForm(f => ({ ...f, start_date: e.target.value }))} />
                  <input style={{ ...st.input, marginBottom: 0, flex: 1 }} type="date" value={promoForm.end_date}
                    onChange={e => setPromoForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>

                <label style={{ ...st.checkRow, marginTop: '8px' }}>
                  <input type="checkbox" checked={promoForm.stackable}
                    onChange={e => setPromoForm(f => ({ ...f, stackable: e.target.checked }))} />
                  Bisa digabung dengan promo lain (stackable)
                </label>

                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button style={st.btn} onClick={savePromo}>{editingPromo ? 'Update' : 'Simpan'}</button>
                  {editingPromo && (
                    <button style={st.btnOutline} onClick={() => {
                      setPromoForm({ name: '', type: 'overall', discount_type: 'percent', discount_amount: '', menu_item_id: '', start_date: '', end_date: '', stackable: false, priority: 0 })
                      setEditingPromo(null)
                    }}>Batal</button>
                  )}
                </div>
              </div>

              <h3 style={{ color: '#1a3d2b', margin: '20px 0 12px' }}>Daftar Promo</h3>
              <p style={{ fontSize: '12px', color: '#888', marginTop: '-8px', marginBottom: '12px' }}>
                Urutan = prioritas. Promo di atas dipakai duluan kalau tidak stackable dengan promo lain.
              </p>
              {promos.length === 0 && <p style={{ color: '#5a5248' }}>Belum ada promo.</p>}
              {promos.map((p, idx) => {
                const today = new Date().toLocaleDateString('en-CA')
                const isLive = p.active && today >= p.start_date && today <= p.end_date
                return (
                  <div key={p.id} style={{ ...st.itemCard, opacity: p.active ? 1 : 0.5, border: isLive ? '1.5px solid #2d7a4f' : '0.5px solid #d6cfc4' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <strong style={{ color: '#2c2c2a' }}>{p.name}</strong>
                        {isLive && <span style={{ ...st.tag, marginLeft: '6px', background: '#d4e8d8', color: '#1a3d2b' }}>🟢 Live</span>}
                        <div style={{ fontSize: '12px', color: '#5a5248', marginTop: '3px' }}>
                          {p.type === 'overall' ? 'Overall' : `Produk: ${p.menu_items?.name || '-'}`}
                          {' · '}
                          {p.discount_type === 'percent' ? `${p.discount_amount}%` : `Rp ${p.discount_amount.toLocaleString('id-ID')}`}
                          {p.stackable ? ' · Stackable' : ' · Tidak stackable'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                          {new Date(p.start_date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - {new Date(p.end_date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button style={st.btnSmall} onClick={() => movePromoPriority(p.id, 'up')} disabled={idx === 0}>↑</button>
                        <button style={st.btnSmall} onClick={() => movePromoPriority(p.id, 'down')} disabled={idx === promos.length - 1}>↓</button>
                        <button style={{ ...st.btnSmall, background: p.active ? '#e67e22' : '#2d7a4f' }} onClick={() => togglePromoActive(p.id, p.active)}>
                          {p.active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button style={st.btnSmall} onClick={() => startEditPromo(p)}>Edit</button>
                        <button style={{ ...st.btnSmall, background: '#c0392b' }} onClick={() => deletePromo(p.id)}>Hapus</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'batch2' && (
            <div>
              <div style={st.sectionBox}>
                <h3 style={{ color: '#1a3d2b', marginBottom: '12px' }}>Setting Order Langsung Hari Ini</h3>
                <p style={{ fontSize: '12px', color: '#888', marginTop: '-6px', marginBottom: '12px' }}>
                  Setting ini berlaku untuk hari ini saja. Reset setiap hari.
                </p>

                <label style={{ ...st.checkRow, fontSize: '15px', fontWeight: '500' }}>
                  <input type="checkbox" checked={batchForm.is_active}
                    onChange={e => setBatchForm(f => ({ ...f, is_active: e.target.checked }))} />
                  🟢 Order Langsung Aktif Hari Ini
                </label>

                <label style={st.label}>Jam Buka:</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                  <input style={{ ...st.input, marginBottom: 0, width: '70px' }} type="number" min="0" max="23"
                    value={batchForm.open_hour} onChange={e => setBatchForm(f => ({ ...f, open_hour: e.target.value }))} />
                  <span>:</span>
                  <input style={{ ...st.input, marginBottom: 0, width: '70px' }} type="number" min="0" max="59"
                    value={batchForm.open_minute} onChange={e => setBatchForm(f => ({ ...f, open_minute: e.target.value }))} />
                </div>

                <label style={st.label}>Jam Tutup:</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                  <input style={{ ...st.input, marginBottom: 0, width: '70px' }} type="number" min="0" max="23"
                    value={batchForm.close_hour} onChange={e => setBatchForm(f => ({ ...f, close_hour: e.target.value }))} />
                  <span>:</span>
                  <input style={{ ...st.input, marginBottom: 0, width: '70px' }} type="number" min="0" max="59"
                    value={batchForm.close_minute} onChange={e => setBatchForm(f => ({ ...f, close_minute: e.target.value }))} />
                </div>

                <label style={st.label}>Stok Shot Espresso Hari Ini:</label>
                <input style={st.input} type="number" placeholder="Misal: 20" value={batchForm.shot_stock}
                  onChange={e => setBatchForm(f => ({ ...f, shot_stock: e.target.value }))} />

                <button style={st.btn} onClick={saveBatchSettings}>Simpan Setting Batch 2</button>

                {batchSettings && (
                  <div style={{ marginTop: '16px', background: '#d4e8d8', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#1a3d2b' }}>
                    <strong>Status Sekarang:</strong><br />
                    Aktif: {batchSettings.is_active ? '🟢 Ya' : '🔴 Tidak'}<br />
                    Jam: {String(batchSettings.open_hour).padStart(2, '0')}:{String(batchSettings.open_minute).padStart(2, '0')} - {String(batchSettings.close_hour).padStart(2, '0')}:{String(batchSettings.close_minute).padStart(2, '0')}<br />
                    Sisa Stok Shot: <strong>{batchSettings.shot_stock - batchSettings.shot_used}</strong> dari {batchSettings.shot_stock}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                      <button style={{ ...st.btnSmall, background: batchSettings.is_active ? '#c0392b' : '#2d7a4f' }} onClick={toggleBatchActive}>
                        {batchSettings.is_active ? 'Matikan Sekarang' : 'Aktifkan Sekarang'}
                      </button>
                      <button style={{ ...st.btnSmall, background: '#e67e22' }} onClick={resetShotUsed}>
                        Reset Stok Terpakai
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={st.sectionBox}>
                <h3 style={{ color: '#1a3d2b', marginBottom: '8px' }}>Menu Eligible Order Langsung</h3>
                <p style={{ fontSize: '12px', color: '#888', marginTop: '-4px', marginBottom: '8px' }}>
                  Atur di tab Menu (centang "Tersedia di Order Langsung"). Daftar menu yang sudah eligible:
                </p>
                {menuItems.filter(m => m.batch2_eligible).length === 0 && <p style={{ fontSize: '13px', color: '#888' }}>Belum ada menu yang di-set untuk Batch 2.</p>}
                {menuItems.filter(m => m.batch2_eligible).map(m => (
                  <span key={m.id} style={{ ...st.tag, marginRight: '6px', marginBottom: '6px', display: 'inline-block' }}>{m.name}</span>
                ))}
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div>
              <div style={st.sectionBox}>
                <h3 style={{ color: '#1a3d2b', marginBottom: '16px' }}>Pengaturan Waktu</h3>
                <label style={st.label}>Jam cutoff order — setelah jam ini, order masuk untuk besok</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                  <input style={{ ...st.input, marginBottom: 0, width: '80px' }} type="number" min="0" max="23"
                    value={settingsForm.order_cutoff_hour} onChange={e => setSettingsForm(f => ({ ...f, order_cutoff_hour: e.target.value }))} />
                  <span style={{ fontSize: '13px', color: '#5a5248' }}>:00</span>
                </div>
                <label style={st.label}>Jam cutoff work order — sebelum jam ini, work order masih tampil untuk kemarin</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                  <input style={{ ...st.input, marginBottom: 0, width: '80px' }} type="number" min="0" max="23"
                    value={settingsForm.workorder_cutoff_hour} onChange={e => setSettingsForm(f => ({ ...f, workorder_cutoff_hour: e.target.value }))} />
                  <span style={{ fontSize: '13px', color: '#5a5248' }}>:00</span>
                </div>
                <button style={st.btn} onClick={saveSettings}>Simpan Pengaturan</button>
                <div style={{ marginTop: '16px', background: '#d4e8d8', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#1a3d2b' }}>
                  <strong>Aktif sekarang:</strong><br />
                  Order cutoff: jam {settings.order_cutoff_hour}:00<br />
                  Work order cutoff: jam {settings.workorder_cutoff_hour}:00
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

const st = {
  container: { minHeight: '100vh', background: '#d8d0c4', display: 'flex', justifyContent: 'center', padding: '20px' },
  card: { background: '#ede8df', borderRadius: '16px', width: '100%', maxWidth: '600px', height: 'fit-content', overflow: 'hidden' },
  header: { background: '#1a3d2b', padding: '16px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  greeting: { background: '#e4ddd2', padding: '12px 16px', borderBottom: '0.5px solid #d6cfc4' },
  greetingName: { fontSize: '14px', fontWeight: '500', color: '#1a3d2b' },
  greetingMsg: { fontSize: '12px', color: '#5a5248', marginTop: '3px' },
  error: { color: '#c0392b', fontSize: '14px', padding: '8px 16px' },
  tabs: { display: 'flex', gap: '6px', padding: '12px 16px 8px', flexWrap: 'wrap' },
  tab: { padding: '7px 12px', border: '1px solid #c5bfb7', borderRadius: '8px', background: '#e4ddd2', cursor: 'pointer', fontSize: '12px', color: '#5a5248' },
  tabActive: { background: '#1a3d2b', color: '#e8f0e2', borderColor: '#1a3d2b' },
  input: { width: '100%', padding: '10px', fontSize: '14px', border: '1px solid #c5bfb7', borderRadius: '8px', marginBottom: '10px', boxSizing: 'border-box', background: '#f7f3ee', color: '#2c2c2a' },
  btn: { width: '100%', padding: '11px', background: '#1a3d2b', color: '#e8f0e2', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' },
  btnSmall: { padding: '6px 12px', background: '#1a3d2b', color: '#e8f0e2', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' },
  btnOutline: { padding: '11px 20px', background: 'transparent', color: '#1a3d2b', border: '1.5px solid #1a3d2b', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' },
  btnRemove: { padding: '6px 10px', background: '#f7f3ee', border: '0.5px solid #c5bfb7', borderRadius: '6px', cursor: 'pointer', color: '#888' },
  label: { fontSize: '13px', color: '#5a5248', display: 'block', marginBottom: '6px' },
  checkRow: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px', cursor: 'pointer', color: '#2c2c2a' },
  dayRow: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px', marginBottom: '4px' },
  dayBtn: { padding: '6px 10px', border: '1px solid #c5bfb7', borderRadius: '6px', background: '#f7f3ee', cursor: 'pointer', fontSize: '12px', color: '#2c2c2a' },
  dayBtnActive: { background: '#1a3d2b', color: '#e8f0e2', borderColor: '#1a3d2b' },
  summaryBox: { background: '#f7f3ee', border: '0.5px solid #d6cfc4', borderRadius: '10px', padding: '14px', marginBottom: '16px' },
  sectionBox: { background: '#f7f3ee', border: '0.5px solid #d6cfc4', borderRadius: '10px', padding: '16px', marginBottom: '8px' },
  workCard: { border: '1.5px solid #1a3d2b', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' },
  workCardHeader: { background: '#1a3d2b', color: '#e8f0e2', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  workEntry: { padding: '10px 14px', borderBottom: '0.5px solid #e4ddd2', background: '#f7f3ee' },
  workEntryRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' },
  countBadge: { background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: '20px', fontSize: '12px' },
  itemCard: { background: '#f7f3ee', border: '0.5px solid #d6cfc4', borderRadius: '8px', padding: '12px', marginBottom: '8px' },
  optionTags: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' },
  tag: { background: '#d4e8d8', color: '#1a3d2b', padding: '2px 8px', borderRadius: '20px', fontSize: '12px' },
  badge: { padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' },
}

export default AdminPage
