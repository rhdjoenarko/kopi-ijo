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
  const [workDateLabel, setWorkDateLabel] = useState('')

  const [menuForm, setMenuForm] = useState({ name: '', price: '', daily_limit: '', available_days: [0,1,2,3,4,5,6], active: true, sort_order: 0 })
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
    let cutoffOrder = 7
    let cutoffWork = 9
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
      if (hour >= cutoffOrder) {
        deliveryDate.setDate(deliveryDate.getDate() + 1)
      }
    } else {
      if (hour >= cutoffWork) {
        deliveryDate.setDate(deliveryDate.getDate() + 1)
      }
    }

    const deliveryStr = deliveryDate.toLocaleDateString('en-CA')
    setWorkDateLabel(`${DAYS[deliveryDate.getDay()]}, ${deliveryDate.getDate()} ${deliveryDate.toLocaleString('id-ID', { month: 'short' })} ${deliveryDate.getFullYear()}`)

    const { data } = await supabase
      .from('orders')
      .select(`*, customers(name, phone), order_items(*, order_item_options(*))`)
      .eq('order_for_date', deliveryStr)
      .order('created_at', { ascending: true })
    if (data) setOrders(data)
  }, [])

  const fetchHistoryOrders = useCallback(async (dateStr, filterType) => {
    let query = supabase.from('orders').select(`*, customers(name, phone), order_items(*, order_item_options(*))`)
    if (filterType === 'untuk') {
      query = query.eq('order_for_date', dateStr)
    } else {
      query = query.gte('created_at', `${dateStr}T00:00:00`).lt('created_at', `${dateStr}T23:59:59`)
    }
    const { data } = await query.order('created_at', { ascending: true })
    if (data) setHistoryOrders(data)
  }, [])

  const fetchAllUnpaid = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select(`*, customers(name, phone), order_items(*, order_item_options(*))`)
      .eq('paid', false)
      .order('created_at', { ascending: false })
    if (data) setAllUnpaidOrders(data)
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      await fetchWorkOrders()
      await fetchAllUnpaid()
      await Promise.all([fetchMenu(), fetchOptionGroups(), fetchDailyTotals()])
      setLoading(false)
    }
    init()
  }, [fetchWorkOrders, fetchAllUnpaid, fetchMenu, fetchOptionGroups, fetchDailyTotals])

  function getWorkOrderGroups() {
    const map = {}
    orders.forEach(o => {
      o.order_items.forEach(oi => {
        if (!map[oi.menu_item_name]) map[oi.menu_item_name] = []
        map[oi.menu_item_name].push({
          customerName: o.customers?.name,
          customerPhone: o.customers?.phone,
          quantity: oi.quantity,
          options: oi.order_item_options,
          paid: o.paid,
          orderId: o.id
        })
      })
    })
    return map
  }

  function getHistoryGroups() {
    const map = {}
    historyOrders.forEach(o => {
      o.order_items.forEach(oi => {
        if (!map[oi.menu_item_name]) map[oi.menu_item_name] = []
        map[oi.menu_item_name].push({
          customerName: o.customers?.name,
          quantity: oi.quantity,
          options: oi.order_item_options,
          paid: o.paid
        })
      })
    })
    return map
  }

  async function togglePaid(orderId, currentPaid) {
    await supabase.from('orders').update({ paid: !currentPaid, paid_at: !currentPaid ? new Date().toISOString() : null }).eq('id', orderId)
    fetchWorkOrders()
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
    setMenuForm({ name: '', price: '', daily_limit: '', available_days: [0,1,2,3,4,5,6], active: true, sort_order: 0 })
    setMenuFormGroups([])
    setEditingMenu(null)
  }

  function startEditMenu(item) {
    setEditingMenu(item.id)
    setMenuForm({ name: item.name, price: item.price, daily_limit: item.daily_limit || '', available_days: item.available_days || [0,1,2,3,4,5,6], active: item.active, sort_order: item.sort_order || 0 })
    setMenuFormGroups(item.menu_item_option_groups.map(r => r.option_group_id))
    setTab('menu')
  }

  function toggleDay(day) {
    setMenuForm(f => ({ ...f, available_days: f.available_days.includes(day) ? f.available_days.filter(d => d !== day) : [...f.available_days, day] }))
  }

  async function saveMenu() {
    if (!menuForm.name.trim() || !menuForm.price) { setError('Nama dan harga wajib diisi.'); return }
    setError('')
    const payload = { name: menuForm.name.trim(), price: parseInt(menuForm.price), daily_limit: menuForm.daily_limit ? parseInt(menuForm.daily_limit) : null, available_days: menuForm.available_days, active: menuForm.active, sort_order: parseInt(menuForm.sort_order) || 0 }
    let menuId = editingMenu
    if (editingMenu) {
      await supabase.from('menu_items').update(payload).eq('id', editingMenu)
      await supabase.from('menu_item_option_groups').delete().eq('menu_item_id', editingMenu)
    } else {
      const { data } = await supabase.from('menu_items').insert(payload).select().single()
      menuId = data.id
    }
    if (menuFormGroups.length > 0) {
      await supabase.from('menu_item_option_groups').insert(menuFormGroups.map(gid => ({ menu_item_id: menuId, option_group_id: gid })))
    }
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
    const a = menuItems[idx]
    const b = menuItems[swapIdx]
    const newSortA = swapIdx
    const newSortB = idx
    await supabase.from('menu_items').update({ sort_order: newSortA }).eq('id', a.id)
    await supabase.from('menu_items').update({ sort_order: newSortB }).eq('id', b.id)
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

  const totalToday = Object.values(dailyTotals).reduce((a, b) => a + Number(b), 0)
  const globalLimitNum = parseInt(globalLimitSaved) || null
  const overGlobalLimit = globalLimitNum && totalToday > globalLimitNum
  const workGroups = getWorkOrderGroups()
  const historyGroups = getHistoryGroups()

  const getBillingList = () => {
    const map = {}
    allUnpaidOrders.forEach(o => {
      const key = o.customers?.phone
      if (!map[key]) map[key] = { name: o.customers?.name, phone: key, total: 0, orders: [] }
      const orderTotal = o.order_items.reduce((sum, oi) => sum + oi.price_at_order * oi.quantity, 0)
      map[key].total += orderTotal
      map[key].orders.push(o)
    })
    return Object.values(map)
  }

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
          {['workorder', 'history', 'billing', 'menu', 'options', 'settings'].map(t => (
            <button key={t} style={{ ...st.tab, ...(tab === t ? st.tabActive : {}) }}
              onClick={() => { setTab(t); if (t === 'history') fetchHistoryOrders(historyDate, historyFilter) }}>
              {{ workorder: '📋 Work Order', history: '📅 History', billing: '💰 Tagihan', menu: '☕ Menu', options: '🎛 Opsi', settings: '⚙️ Setting' }[t]}
            </button>
          ))}
        </div>

        <div style={{ padding: '0 16px 24px' }}>

          {tab === 'workorder' && (
            <div>
              <div style={st.summaryBox}>
                <strong style={{ color: '#1a3d2b' }}>Work Order</strong>
                <div style={{ fontSize: '13px', color: '#1a3d2b', marginTop: '2px' }}>
                  Delivery: <strong>{workDateLabel}</strong>
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
                  {entries.map((entry, i) => (
                    <div key={i} style={st.workEntry}>
                      <div style={st.workEntryRow}>
                        <div>
                          <span style={{ fontSize: '13px', fontWeight: '500', color: '#2c2c2a' }}>
                            {entry.quantity > 1 ? `${entry.quantity}x ` : ''}{entry.customerName}
                          </span>
                          <span style={{ fontSize: '12px', color: '#888', marginLeft: '6px' }}>{entry.customerPhone}</span>
                          {entry.options.length > 0 && (
                            <div style={st.optionTags}>
                              {entry.options.map(opt => (
                                <span key={opt.id} style={st.tag}>{opt.option_group_name}: {opt.option_choice_label}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button style={{ ...st.btnSmall, background: entry.paid ? '#2d7a4f' : '#e67e22', minWidth: '100px' }}
                          onClick={() => togglePaid(entry.orderId, entry.paid)}>
                          {entry.paid ? '✓ Lunas' : 'Belum Bayar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {tab === 'history' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  <button style={{ ...st.btnSmall, background: historyFilter === 'untuk' ? '#1a3d2b' : '#d6cfc4', color: historyFilter === 'untuk' ? '#fff' : '#5a5248' }}
                    onClick={() => { setHistoryFilter('untuk'); fetchHistoryOrders(historyDate, 'untuk') }}>
                    Tanggal Delivery
                  </button>
                  <button style={{ ...st.btnSmall, background: historyFilter === 'pesan' ? '#1a3d2b' : '#d6cfc4', color: historyFilter === 'pesan' ? '#fff' : '#5a5248' }}
                    onClick={() => { setHistoryFilter('pesan'); fetchHistoryOrders(historyDate, 'pesan') }}>
                    Tanggal Pesan
                  </button>
                </div>
                <input style={st.input} type="date" value={historyDate}
                  onChange={e => { setHistoryDate(e.target.value); fetchHistoryOrders(e.target.value, historyFilter) }} />
              </div>

              {Object.keys(historyGroups).length === 0 && <p style={{ color: '#5a5248' }}>Tidak ada order di tanggal ini.</p>}

              {Object.entries(historyGroups).map(([menuName, entries]) => (
                <div key={menuName} style={st.workCard}>
                  <div style={st.workCardHeader}>
                    <strong>{menuName}</strong>
                    <span style={st.countBadge}>{entries.reduce((sum, e) => sum + e.quantity, 0)} cup</span>
                  </div>
                  {entries.map((entry, i) => (
                    <div key={i} style={st.workEntry}>
                      <div style={st.workEntryRow}>
                        <div>
                          <span style={{ fontSize: '13px', fontWeight: '500', color: '#2c2c2a' }}>
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
                        <span style={{ ...st.badge, background: entry.paid ? '#d4e8d8' : '#fef3e2', color: entry.paid ? '#1a3d2b' : '#e67e22' }}>
                          {entry.paid ? '✓ Lunas' : '⏳ Belum'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {tab === 'billing' && (
            <div>
              <h3 style={{ color: '#1a3d2b', marginBottom: '12px' }}>Tagihan Belum Dibayar</h3>
              {getBillingList().length === 0 && <p style={{ color: '#5a5248' }}>Semua sudah lunas! 🎉</p>}
              {getBillingList().map(cs => (
                <div key={cs.phone} style={st.billingCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <strong style={{ color: '#2c2c2a' }}>{cs.name}</strong>
                      <span style={{ fontSize: '12px', color: '#888', marginLeft: '6px' }}>{cs.phone}</span>
                    </div>
                    <strong style={{ color: '#c0392b' }}>Rp {cs.total.toLocaleString('id-ID')}</strong>
                  </div>
                  {cs.orders.map(o => (
                    <div key={o.id} style={{ marginTop: '8px', paddingTop: '8px', borderTop: '0.5px solid #d6cfc4' }}>
                      <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                        Pesan: {formatTimestamp(o.created_at)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#1a3d2b', marginBottom: '4px', fontWeight: '500' }}>
                        Delivery: {o.order_for_date ? new Date(o.order_for_date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </div>
                      {o.order_items.map(oi => (
                        <div key={oi.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#2c2c2a', padding: '2px 0' }}>
                          <span>{oi.quantity}x {oi.menu_item_name}</span>
                          <span>Rp {(oi.price_at_order * oi.quantity).toLocaleString('id-ID')}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  <button style={{ ...st.btn, marginTop: '12px', background: '#2d7a4f' }}
                    onClick={async () => {
                      for (const o of cs.orders) await supabase.from('orders').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', o.id)
                      fetchWorkOrders()
                      fetchAllUnpaid()
                    }}>
                    Tandai Semua Lunas
                  </button>
                </div>
              ))}
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
                <label style={st.label}>Tersedia hari:</label>
                <div style={st.dayRow}>
                  {DAYS.map((d, i) => (
                    <button key={i} style={{ ...st.dayBtn, ...(menuForm.available_days.includes(i) ? st.dayBtnActive : {}) }} onClick={() => toggleDay(i)}>
                      {d.slice(0, 3)}
                    </button>
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
                <label style={{ ...st.checkRow, marginTop: '8px' }}>
                  <input type="checkbox" checked={menuForm.active} onChange={e => setMenuForm(f => ({ ...f, active: e.target.checked }))} />
                  {' '}Aktif
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
                      <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                        {item.available_days?.map(d => DAYS[d]).join(', ')}
                      </div>
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

          {tab === 'settings' && (
            <div>
              <div style={st.sectionBox}>
                <h3 style={{ color: '#1a3d2b', marginBottom: '16px' }}>Pengaturan Waktu</h3>
                <label style={st.label}>Jam cutoff order — setelah jam ini, order masuk untuk besok</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                  <input style={{ ...st.input, marginBottom: 0, width: '80px' }} type="number" min="0" max="23"
                    value={settingsForm.order_cutoff_hour}
                    onChange={e => setSettingsForm(f => ({ ...f, order_cutoff_hour: e.target.value }))} />
                  <span style={{ fontSize: '13px', color: '#5a5248' }}>:00</span>
                </div>
                <label style={st.label}>Jam cutoff work order — sebelum jam ini, work order masih tampil untuk kemarin</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                  <input style={{ ...st.input, marginBottom: 0, width: '80px' }} type="number" min="0" max="23"
                    value={settingsForm.workorder_cutoff_hour}
                    onChange={e => setSettingsForm(f => ({ ...f, workorder_cutoff_hour: e.target.value }))} />
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
  billingCard: { background: '#f7f3ee', border: '1.5px solid #e67e22', borderRadius: '10px', padding: '14px', marginBottom: '10px' },
  optionTags: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' },
  tag: { background: '#d4e8d8', color: '#1a3d2b', padding: '2px 8px', borderRadius: '20px', fontSize: '12px' },
  badge: { padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' },
}

export default AdminPage    