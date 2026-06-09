import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

function getOrderTarget(cutoffHour) {
  const now = new Date()
  const target = new Date(now)
  if (now.getHours() >= cutoffHour) target.setDate(target.getDate() + 1)
  return target
}

function formatOrderDate(date) {
  const day = DAYS[date.getDay()]
  const tanggal = date.getDate()
  const bulan = date.toLocaleString('id-ID', { month: 'short' })
  const tahun = date.getFullYear()
  return `${day}, ${tanggal} ${bulan} ${tahun}`
}

function formatTimestamp(dateStr) {
  const date = new Date(dateStr)
  const day = DAYS[date.getDay()]
  const tanggal = date.getDate()
  const bulan = date.toLocaleString('id-ID', { month: 'short' })
  const tahun = date.getFullYear()
  const jam = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${tanggal} ${bulan} ${tahun} · ${jam}`
}

function formatOrderFor(orderForDate, createdAt, cutoffHour) {
  if (orderForDate) {
    const date = new Date(orderForDate + 'T00:00:00')
    return formatOrderDate(date)
  }
  const created = new Date(createdAt)
  const target = new Date(created)
  if (created.getHours() >= cutoffHour) target.setDate(target.getDate() + 1)
  return formatOrderDate(target)
}

function CustomerPage() {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [customer, setCustomer] = useState(null)
  const [step, setStep] = useState('phone')
  const [activeTab, setActiveTab] = useState('menu')
  const [menuItems, setMenuItems] = useState([])
  const [cart, setCart] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [orderSuccess, setOrderSuccess] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [orderCutoff, setOrderCutoff] = useState(7)
  const [paymentAccounts, setPaymentAccounts] = useState([])

  useEffect(() => {
    supabase.from('settings').select('*').then(({ data }) => {
      if (data) {
        const map = {}
        data.forEach(d => { map[d.key] = parseInt(d.value) })
        const cutoff = map.order_cutoff_hour ?? 7
        setOrderCutoff(cutoff)
        const target = getOrderTarget(cutoff)
        setOrderTarget(target)
        setIsNextDay(new Date().getHours() >= cutoff)
        setTodayIndex(target.getDay())
      }
    })
    supabase.from('payment_accounts').select('*').eq('active', true).order('sort_order').then(({ data }) => {
      if (data) setPaymentAccounts(data)
    })
  }, [])

  const [orderTarget, setOrderTarget] = useState(getOrderTarget(7))
  const [isNextDay, setIsNextDay] = useState(false)
  const [todayIndex, setTodayIndex] = useState(getOrderTarget(7).getDay())

  useEffect(() => {
    if (step === 'menu') { fetchMenu(); fetchMyOrders() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function fetchMenu() {
    const { data, error } = await supabase
      .from('menu_items')
      .select(`*, menu_item_option_groups(option_group_id, option_groups(id, name, required, option_choices(id, label, sort_order, price_addition)))`)
      .eq('active', true)
      .contains('available_days', [todayIndex])
      .order('sort_order', { ascending: true })
    if (error) { setError('Gagal load menu.'); return }
    const { data: totals } = await supabase.from('daily_item_totals').select('*')
    const totalsMap = {}
    if (totals) totals.forEach(t => { totalsMap[t.menu_item_id] = t.total_ordered })
    setMenuItems(data.map(item => ({
      ...item,
      soldToday: totalsMap[item.id] || 0,
      optionGroups: item.menu_item_option_groups.map(r => ({
        ...r.option_groups,
        choices: [...r.option_groups.option_choices].sort((a, b) => a.sort_order - b.sort_order)
      }))
    })))
  }

  async function fetchMyOrders() {
    if (!customer) return
    const { data } = await supabase
      .from('orders')
      .select(`*, order_items(*, order_item_options(*))`)
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
    if (data) setOrders(data)
    refreshCustomer()
  }

  async function refreshCustomer() {
    if (!customer) return
    const { data } = await supabase.from('customers').select('*').eq('id', customer.id).single()
    if (data) setCustomer(data)
  }

  async function handlePhoneSubmit() {
    if (!phone || phone.length < 8) { setError('Nomor HP tidak valid.'); return }
    setLoading(true); setError('')
    const { data } = await supabase.from('customers').select('*').eq('phone', phone).single()
    setLoading(false)
    if (data) { setCustomer(data); setStep('menu') }
    else setStep('register')
  }

  async function handleRegister() {
    if (!name.trim()) { setError('Nama tidak boleh kosong.'); return }
    setLoading(true)
    const { data, error } = await supabase.from('customers').insert({ phone, name: name.trim() }).select().single()
    setLoading(false)
    if (error) { setError('Gagal daftar.'); return }
    setCustomer(data); setStep('menu')
  }

  function addToCart(item) {
    const defaultOptions = {}
    item.optionGroups.forEach(og => {
      if (og.required && og.choices.length > 0) defaultOptions[og.id] = og.choices[0]
    })
    setCart(prev => [...prev, { item, selectedOptions: defaultOptions, quantity: 1, cartId: Date.now() }])
  }

  function removeFromCart(cartId) { setCart(prev => prev.filter(c => c.cartId !== cartId)) }

  function updateOption(cartId, groupId, choice) {
    setCart(prev => prev.map(c => c.cartId === cartId ? { ...c, selectedOptions: { ...c.selectedOptions, [groupId]: choice } } : c))
  }

  function updateQuantity(cartId, delta) {
    setCart(prev => prev
      .map(c => c.cartId === cartId ? { ...c, quantity: c.quantity + delta } : c)
      .filter(c => c.quantity > 0)
    )
  }

  const getItemPrice = (cartItem) => {
    const optionsTotal = Object.values(cartItem.selectedOptions).reduce((sum, choice) => sum + (choice?.price_addition || 0), 0)
    return (cartItem.item.price + optionsTotal) * cartItem.quantity
  }

  function getMergedCart() {
    const merged = []
    cart.forEach(cartItem => {
      const optionKey = Object.entries(cartItem.selectedOptions)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([groupId, choice]) => `${groupId}:${choice?.id || 'null'}`)
        .join('|')
      const key = `${cartItem.item.id}__${optionKey}`
      const existing = merged.find(m => m.key === key)
      if (existing) {
        existing.quantity += cartItem.quantity
      } else {
        merged.push({ ...cartItem, quantity: cartItem.quantity, key })
      }
    })
    return merged
  }

  const total = cart.reduce((sum, c) => sum + getItemPrice(c), 0)

  async function handleOrder() {
    setLoading(true); setError(''); setShowSummary(false)
    // Hitung total order
    const orderTotal = cart.reduce((sum, cartItem) => {
      const itemPrice = cartItem.item.price + Object.values(cartItem.selectedOptions).reduce((s, c) => s + (c?.price_addition || 0), 0)
      return sum + itemPrice * cartItem.quantity
    }, 0)

    // Hitung credit yang dipakai
    const { data: customerData } = await supabase.from('customers').select('credit_balance').eq('id', customer.id).single()
    const availableCredit = customerData?.credit_balance || 0
    const creditUsed = Math.min(availableCredit, orderTotal)

    // Kurangi credit customer
    if (creditUsed > 0) {
      await supabase.from('customers').update({ credit_balance: availableCredit - creditUsed }).eq('id', customer.id)
    }

    const { data: order, error: orderError } = await supabase.from('orders').insert({ 
      customer_id: customer.id,
      order_for_date: orderTarget.toLocaleDateString('en-CA'),
      credit_used: creditUsed
    }).select().single()
    if (orderError) { setError('Gagal membuat order.'); setLoading(false); return }
    for (const cartItem of cart) {
      const itemPrice = cartItem.item.price + Object.values(cartItem.selectedOptions).reduce((sum, c) => sum + (c?.price_addition || 0), 0)
      const { data: oi, error: oiError } = await supabase.from('order_items').insert({
        order_id: order.id, menu_item_id: cartItem.item.id,
        menu_item_name: cartItem.item.name, price_at_order: itemPrice, quantity: cartItem.quantity
      }).select().single()
      if (oiError) { setError('Gagal menyimpan item.'); setLoading(false); return }
      const optionInserts = Object.entries(cartItem.selectedOptions)
        .filter(([_, choice]) => choice !== null)
        .map(([groupId, choice]) => ({
          order_item_id: oi.id, option_group_id: groupId,
          option_group_name: cartItem.item.optionGroups.find(og => og.id === groupId)?.name || '',
          option_choice_id: choice.id, option_choice_label: choice.label
        }))
      if (optionInserts.length > 0) await supabase.from('order_item_options').insert(optionInserts)
    }
    setLoading(false); setOrderSuccess(true); setCart([]); fetchMyOrders(); refreshCustomer()
  }

  if (orderSuccess) return (
    <div style={st.container}>
      <div style={st.card}>
        <div style={st.header}>
          <img src="https://haixnqmapezjikgpwjqh.supabase.co/storage/v1/object/public/assets/kopi%20ijo.png"
            alt="Kopi Ijø" style={{ height: '80px', objectFit: 'contain' }} />
        </div>
        <div style={{ padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>✓</div>
          <h2 style={{ color: '#1a3d2b', margin: '0 0 8px' }}>Order masuk!</h2>
          <p style={{ color: '#5a5248', fontSize: '14px', margin: '0 0 24px' }}>
            Makasih ya, <strong>{customer?.name}</strong>! Ordermu untuk <strong>{isNextDay ? 'besok' : 'hari ini'} ({formatOrderDate(orderTarget)})</strong> udah kami terima. Sampai ketemu! ☕
          </p>
          <button style={st.btn} onClick={() => { setOrderSuccess(false); setActiveTab('menu'); fetchMenu() }}>Order Lagi</button>
          <button style={{ ...st.btnOutline, marginTop: '8px' }} onClick={() => { setOrderSuccess(false); setActiveTab('riwayat') }}>Lihat Riwayat</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={st.container}>
      <div style={st.card}>

        <div style={st.header}>
          <img src="https://haixnqmapezjikgpwjqh.supabase.co/storage/v1/object/public/assets/kopi%20ijo.png"
            alt="Kopi Ijø" style={{ height: '80px', objectFit: 'contain' }} />
        </div>

        {error && <p style={st.error}>{error}</p>}

        {step === 'phone' && (
          <div style={{ padding: '24px' }}>
            <p style={{ color: '#5a5248', marginTop: 0 }}>Masukkan nomor HP kamu untuk mulai order:</p>
            <input style={st.input} type="tel" placeholder="08xxxxxxxxxx" value={phone}
              onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePhoneSubmit()} />
            <button style={st.btn} onClick={handlePhoneSubmit} disabled={loading}>
              {loading ? 'Mengecek...' : 'Lanjut'}
            </button>
          </div>
        )}

        {step === 'register' && (
          <div style={{ padding: '24px' }}>
            <p style={{ color: '#5a5248', marginTop: 0 }}>Halo! Sepertinya kamu baru pertama kali di sini. Siapa namamu?</p>
            <input style={st.input} type="text" placeholder="Nama kamu" value={name}
              onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRegister()} />
            <button style={st.btn} onClick={handleRegister} disabled={loading}>
              {loading ? 'Mendaftar...' : 'Daftar & Lanjut'}
            </button>
          </div>
        )}

        {step === 'menu' && (
          <div>
            <div style={st.greeting}>
              <div style={st.greetingName}>Halo, {customer?.name}! 👋</div>
              <div style={st.greetingMsg}>Makasih udah support Kopi Ijø hari ini. Yuk, pilih minumanmu!</div>
            </div>

            <div style={isNextDay ? st.notifNextDay : st.notifToday}>
              {isNextDay
                ? <span>⚠️ <strong>Sudah lewat jam {orderCutoff}:00 — kamu sedang order untuk BESOK ({formatOrderDate(orderTarget)})</strong></span>
                : <span>📅 Order untuk hari ini: <strong>{formatOrderDate(orderTarget)}</strong></span>
              }
            </div>

            <div style={st.tabs}>
              <button style={{ ...st.tab, ...(activeTab === 'menu' ? st.tabActive : {}) }} onClick={() => setActiveTab('menu')}>☕ Menu</button>
              <button style={{ ...st.tab, ...(activeTab === 'riwayat' ? st.tabActive : {}) }} onClick={() => { setActiveTab('riwayat'); fetchMyOrders() }}>📋 Riwayat & Tagihan</button>
            </div>

            {activeTab === 'menu' && (
              <div style={{ padding: '0 16px 16px' }}>
                {menuItems.length === 0 && <p style={{ color: '#5a5248' }}>Tidak ada menu tersedia {isNextDay ? 'besok' : 'hari ini'}.</p>}

                {menuItems.map(item => {
                  const isSoldOut = item.daily_limit !== null && item.soldToday >= item.daily_limit
                  return (
                    <div key={item.id} style={{ ...st.menuItem, opacity: isSoldOut ? 0.5 : 1, padding: 0, overflow: 'hidden' }}>
                      {item.image_url && (
                        <div style={{ position: 'relative' }}>
                          <img src={item.image_url} alt={item.name}
                            style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                          {item.daily_limit && !isSoldOut && (
                            <span style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: '11px', padding: '3px 8px', borderRadius: '20px' }}>
                              Sisa {item.daily_limit - item.soldToday}
                            </span>
                          )}
                          {isSoldOut && (
                            <span style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(192,57,43,0.85)', color: '#fff', fontSize: '11px', padding: '3px 8px', borderRadius: '20px' }}>
                              Habis
                            </span>
                          )}
                        </div>
                      )}
                      <div style={{ ...st.menuRow, padding: '12px' }}>
                        <div>
                          <strong style={{ color: '#2c2c2a' }}>{item.name}</strong>
                          <div style={{ fontSize: '12px', color: '#1a3d2b', marginTop: '2px' }}>
                            Rp {item.price.toLocaleString('id-ID')}
                            {!item.image_url && isSoldOut && <span style={{ color: '#c0392b', marginLeft: '6px' }}>· Habis</span>}
                            {!item.image_url && item.daily_limit && !isSoldOut && <span style={{ color: '#888', marginLeft: '6px' }}>· Sisa {item.daily_limit - item.soldToday}</span>}
                          </div>
                        </div>
                        <button style={{ ...st.addBtn, ...(isSoldOut ? st.addBtnDisabled : {}) }}
                          onClick={() => !isSoldOut && addToCart(item)} disabled={isSoldOut}>
                          + Tambah
                        </button>
                      </div>
                    </div>
                  )
                })}

                {cart.length > 0 && (
                  <div style={st.cartBox}>
                    <div style={st.cartHeader}>
                      <span>🛒</span>
                      <span style={{ letterSpacing: '0.5px' }}>KERANJANG</span>
                    </div>
                    <div style={{ padding: '12px' }}>
                      {getMergedCart().map(cartItem => (
                        <div key={cartItem.cartId} style={st.cartItem}>
                          <div style={st.menuRow}>
                            <strong style={{ fontSize: '13px', color: '#2c2c2a' }}>{cartItem.item.name}</strong>
                            <button style={st.btnRemove} onClick={() => removeFromCart(cartItem.cartId)}>✕</button>
                          </div>
                          {cartItem.item.optionGroups.map(og => (
                            <div key={og.id} style={{ marginTop: '8px' }}>
                              <span style={st.optionLabel}>
                                {og.name}
                                {og.required
                                  ? <span style={{ color: '#c0392b', marginLeft: '4px', fontSize: '11px' }}>*wajib</span>
                                  : <span style={{ color: '#888', marginLeft: '4px', fontSize: '11px' }}>(opsional)</span>}:
                              </span>
                              <div style={st.optionBtns}>
                                {!og.required && (
                                  <button style={{ ...st.optBtn, ...(!cartItem.selectedOptions[og.id] ? st.optBtnActive : {}) }}
                                    onClick={() => updateOption(cartItem.cartId, og.id, null)}>
                                    Tidak ada
                                  </button>
                                )}
                                {og.choices.map(choice => (
                                  <button key={choice.id}
                                    style={{ ...st.optBtn, ...(cartItem.selectedOptions[og.id]?.id === choice.id ? st.optBtnActive : {}) }}
                                    onClick={() => updateOption(cartItem.cartId, og.id, choice)}>
                                    {choice.label}{choice.price_addition > 0 ? ` (+Rp ${choice.price_addition.toLocaleString('id-ID')})` : ''}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div style={st.qtyRow}>
                            <button style={st.qtyBtn} onClick={() => updateQuantity(cartItem.cartId, -1)}>−</button>
                            <span style={{ minWidth: '20px', textAlign: 'center', fontSize: '13px', color: '#2c2c2a' }}>{cartItem.quantity}</span>
                            <button style={st.qtyBtn} onClick={() => updateQuantity(cartItem.cartId, 1)}>+</button>
                            <span style={{ marginLeft: 'auto', color: '#1a3d2b', fontWeight: 'bold', fontSize: '13px' }}>
                              Rp {getItemPrice(cartItem).toLocaleString('id-ID')}
                            </span>
                          </div>
                        </div>
                      ))}
                      <div style={st.totalRow}>
                        <strong>Total</strong>
                        <strong style={{ color: '#1a3d2b' }}>Rp {total.toLocaleString('id-ID')}</strong>
                      </div>
                      <button style={st.btn} onClick={() => setShowSummary(true)} disabled={loading}>
                        Pesan Sekarang
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'riwayat' && (
              <div style={{ padding: '0 16px 16px' }}>
                <h3 style={{ color: '#1a3d2b', marginBottom: '12px' }}>Riwayat & Tagihan</h3>
                {orders.length === 0 && <p style={{ color: '#5a5248' }}>Belum ada order.</p>}

                {(() => {
                  const totalBelumBayar = orders
                    .filter(o => !o.paid)
                    .reduce((sum, o) => {
                      const subtotal = o.order_items.reduce((s, oi) => s + oi.price_at_order * oi.quantity, 0)
                      return sum + Math.max(0, subtotal - (o.credit_used || 0))
                    }, 0)
                  return (
                    <>
                      <div style={{ ...st.metricCard, marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: totalBelumBayar > 0 ? '8px' : 0 }}>
                          <span style={{ fontSize: '13px', color: '#5a5248' }}>Saldo Credit</span>
                          <strong style={{ color: '#1a3d2b' }}>Rp {(customer?.credit_balance || 0).toLocaleString('id-ID')}</strong>
                        </div>
                        {totalBelumBayar > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '13px', color: '#5a5248' }}>Total Belum Dibayar</span>
                            <strong style={{ color: '#c0392b' }}>Rp {totalBelumBayar.toLocaleString('id-ID')}</strong>
                          </div>
                        )}
                      </div>

                      {paymentAccounts.length > 0 && totalBelumBayar > 0 && (
                        <div style={{ background: '#f7f3ee', border: '0.5px solid #d6cfc4', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: '#1a3d2b', marginBottom: '10px' }}>💳 Info Pembayaran</div>
                          <div style={{ fontSize: '12px', color: '#5a5248', marginBottom: '8px' }}>Transfer ke salah satu rekening berikut:</div>
                          {paymentAccounts.map(pa => (
                            <div key={pa.id} style={{ background: '#fff', border: '0.5px solid #d6cfc4', borderRadius: '8px', padding: '10px', marginBottom: '6px' }}>
                              <div style={{ fontSize: '12px', color: '#888', marginBottom: '2px' }}>{pa.bank_name}</div>
                              <div style={{ fontSize: '15px', fontWeight: '500', color: '#2c2c2a', letterSpacing: '0.5px' }}>{pa.account_number}</div>
                              <div style={{ fontSize: '12px', color: '#5a5248', marginTop: '2px' }}>a.n. {pa.account_name}</div>
                            </div>
                          ))}
                          <div style={{ fontSize: '11px', color: '#888', marginTop: '6px' }}>Setelah transfer, konfirmasi ke kami via WhatsApp ya! 🙏</div>
                        </div>
                      )}
                    </>
                  )
                })()}

                {orders.map(o => {
                  const orderTotal = o.order_items.reduce((sum, oi) => sum + oi.price_at_order * oi.quantity, 0)
                  const isExpanded = expandedOrder === o.id
                  return (
                    <div key={o.id} style={{ ...st.orderCard, borderLeft: `4px solid ${o.paid ? '#1a3d2b' : '#e67e22'}` }}>
                      <div style={{ ...st.orderHeader, cursor: 'pointer' }} onClick={() => setExpandedOrder(isExpanded ? null : o.id)}>
                        <div>
                          <div style={st.meta}>Dipesan: {formatTimestamp(o.created_at)}</div>
                          <div style={{ fontSize: '12px', color: '#1a3d2b', fontWeight: '500', marginTop: '2px' }}>
                            Delivery: {formatOrderFor(o.order_for_date, o.created_at, orderCutoff)}
                          </div>
                          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '0.5px solid #d6cfc4' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#2c2c2a' }}>
                          <span>Subtotal</span>
                          <span>Rp {orderTotal.toLocaleString('id-ID')}</span>
                        </div>
                        {o.credit_used > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1a3d2b' }}>
                            <span>Credit dipakai</span>
                            <span>- Rp {o.credit_used.toLocaleString('id-ID')}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: o.paid ? '#1a3d2b' : '#c0392b', marginTop: '4px' }}>
                          <span>Total Tagihan</span>
                          <span>Rp {(orderTotal - (o.credit_used || 0)).toLocaleString('id-ID')}</span>
                        </div>
                      </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                          {(() => {
                            const subtotal = o.order_items.reduce((s, oi) => s + oi.price_at_order * oi.quantity, 0)
                            const sisaTagihan = Math.max(0, subtotal - (o.credit_used || 0))
                            const effectivePaid = o.paid || sisaTagihan === 0
                            return (
                              <span style={{ ...st.badge, background: effectivePaid ? '#d4e8d8' : '#fef3e2', color: effectivePaid ? '#1a3d2b' : '#e67e22' }}>
                                {effectivePaid ? '✓ Lunas' : '⏳ Belum Bayar'}
                              </span>
                            )
                          })()}
                          <span style={{ fontSize: '11px', color: '#888' }}>{isExpanded ? '▲ tutup' : '▼ detail'}</span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '0.5px solid #d6cfc4' }}>
                          {o.order_items.map(oi => (
                            <div key={oi.id} style={{ marginBottom: '10px' }}>
                              <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', color: '#2c2c2a' }}>
                                <span>{oi.quantity}x <strong>{oi.menu_item_name}</strong></span>
                                <span>Rp {(oi.price_at_order * oi.quantity).toLocaleString('id-ID')}</span>
                              </div>
                              {oi.order_item_options.length > 0 && (
                                <div style={st.optionBtns}>
                                  {oi.order_item_options.map(opt => (
                                    <span key={opt.id} style={st.tag}>{opt.option_group_name}: {opt.option_choice_label}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showSummary && (
        <div style={st.overlay}>
          <div style={st.popup}>
            <div style={{ ...st.cartHeader, borderRadius: '10px 10px 0 0' }}>
              <span>🛒</span>
              <span style={{ letterSpacing: '0.5px' }}>KONFIRMASI ORDER</span>
            </div>
            <div style={{ padding: '16px' }}>
              <div style={isNextDay ? st.notifNextDay : st.notifToday}>
                {isNextDay
                  ? <span>⚠️ <strong>Order untuk BESOK ({formatOrderDate(orderTarget)})</strong></span>
                  : <span>📅 Order untuk hari ini: <strong>{formatOrderDate(orderTarget)}</strong></span>}
              </div>
              {getMergedCart().map(cartItem => (
                <div key={cartItem.cartId} style={{ borderBottom: '0.5px solid #d6cfc4', paddingBottom: '10px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#2c2c2a' }}>
                    <span>{cartItem.quantity}x <strong>{cartItem.item.name}</strong></span>
                    <span style={{ color: '#1a3d2b' }}>Rp {getItemPrice(cartItem).toLocaleString('id-ID')}</span>
                  </div>
                  <div style={st.optionBtns}>
                    {Object.entries(cartItem.selectedOptions).filter(([_, c]) => c !== null).map(([groupId, choice]) => (
                      <span key={groupId} style={st.tag}>
                        {cartItem.item.optionGroups.find(og => og.id === groupId)?.name}: {choice.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <div style={st.totalRow}>
                <strong>Total</strong>
                <strong style={{ color: '#1a3d2b' }}>Rp {total.toLocaleString('id-ID')}</strong>
              </div>
              <button style={st.btn} onClick={handleOrder} disabled={loading}>
                {loading ? 'Memproses...' : '✓ Konfirmasi Order'}
              </button>
              <button style={{ ...st.btnOutline, marginTop: '8px' }} onClick={() => setShowSummary(false)}>
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const st = {
  container: { minHeight: '100vh', background: '#d8d0c4', display: 'flex', justifyContent: 'center', padding: '20px' },
  card: { background: '#ede8df', borderRadius: '16px', width: '100%', maxWidth: '480px', height: 'fit-content', overflow: 'hidden' },
  header: { background: '#1a3d2b', padding: '16px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  greeting: { background: '#e4ddd2', padding: '12px 16px', borderBottom: '0.5px solid #d6cfc4' },
  greetingName: { fontSize: '14px', fontWeight: '500', color: '#1a3d2b' },
  greetingMsg: { fontSize: '12px', color: '#5a5248', marginTop: '3px' },
  notifToday: { background: '#d4e8d8', borderBottom: '0.5px solid #b8d4bc', padding: '8px 16px', fontSize: '13px', color: '#1a3d2b' },
  notifNextDay: { background: '#fef3e2', borderBottom: '2px solid #e67e22', padding: '8px 16px', fontSize: '13px', color: '#7d3c00' },
  tabs: { display: 'flex', gap: '8px', padding: '12px 16px 8px' },
  tab: { flex: 1, padding: '8px', border: '1px solid #c5bfb7', borderRadius: '8px', background: '#e4ddd2', cursor: 'pointer', fontSize: '13px', color: '#5a5248' },
  tabActive: { background: '#1a3d2b', color: '#e8f0e2', borderColor: '#1a3d2b' },
  input: { width: '100%', padding: '10px', fontSize: '15px', border: '1px solid #c5bfb7', borderRadius: '8px', marginBottom: '12px', boxSizing: 'border-box', background: '#f7f3ee', color: '#2c2c2a' },
  btn: { width: '100%', padding: '12px', background: '#1a3d2b', color: '#e8f0e2', border: 'none', borderRadius: '8px', fontSize: '15px', cursor: 'pointer', marginTop: '8px' },
  btnOutline: { width: '100%', padding: '12px', background: 'transparent', color: '#1a3d2b', border: '1.5px solid #1a3d2b', borderRadius: '8px', fontSize: '15px', cursor: 'pointer' },
  btnRemove: { background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '15px' },
  error: { color: '#c0392b', fontSize: '14px', padding: '0 16px' },
  menuItem: { background: '#f7f3ee', border: '0.5px solid #d6cfc4', borderRadius: '8px', padding: '12px', marginBottom: '8px' },
  menuRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  addBtn: { padding: '6px 12px', background: '#1a3d2b', color: '#e8f0e2', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' },
  addBtnDisabled: { background: '#ccc', cursor: 'not-allowed' },
  cartBox: { border: '1.5px solid #1a3d2b', borderRadius: '10px', overflow: 'hidden', marginTop: '16px' },
  cartHeader: { background: '#1a3d2b', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#e8f0e2', fontSize: '13px', fontWeight: '500' },
  cartItem: { background: '#ede8df', border: '0.5px solid #d6cfc4', borderRadius: '7px', padding: '10px', marginBottom: '8px' },
  optionLabel: { fontSize: '12px', color: '#5a5248', display: 'block', marginBottom: '4px' },
  optionBtns: { display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '4px' },
  optBtn: { padding: '3px 9px', border: '0.5px solid #c5bfb7', borderRadius: '20px', background: '#f7f3ee', cursor: 'pointer', fontSize: '12px', color: '#2c2c2a' },
  optBtnActive: { background: '#1a3d2b', color: '#e8f0e2', borderColor: '#1a3d2b' },
  qtyRow: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' },
  qtyBtn: { width: '26px', height: '26px', border: '0.5px solid #c5bfb7', borderRadius: '50%', background: '#f7f3ee', cursor: 'pointer', fontSize: '15px', color: '#2c2c2a' },
  totalRow: { display: 'flex', justifyContent: 'space-between', fontSize: '15px', padding: '8px 0', borderTop: '0.5px solid #d6cfc4', marginTop: '4px' },
  orderCard: { background: '#f7f3ee', border: '0.5px solid #d6cfc4', borderRadius: '8px', padding: '12px', marginBottom: '10px' },
  orderHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' },
  unpaidBox: { background: '#fef3e2', border: '1px solid #e67e22', borderRadius: '8px', padding: '12px', marginBottom: '12px', color: '#7d3c00', fontSize: '14px' },
  badge: { padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '500' },
  tag: { background: '#d4e8d8', color: '#1a3d2b', padding: '2px 8px', borderRadius: '20px', fontSize: '12px' },
  meta: { color: '#888', fontSize: '12px' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', zIndex: 100 },
  popup: { background: '#ede8df', borderRadius: '12px', width: '100%', maxWidth: '440px', maxHeight: '80vh', overflowY: 'auto', overflow: 'hidden' },
  metricCard: { background: '#f7f3ee', border: '0.5px solid #d6cfc4', borderRadius: '10px', padding: '12px' },
}

export default CustomerPage