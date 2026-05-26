import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { startOfMonth, endOfMonth, startOfYear, subMonths, format, parseISO, eachDayOfInterval } from 'date-fns'
import { id } from 'date-fns/locale'

function AnalyticsPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [filterType, setFilterType] = useState('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [loyaltyBy, setLoyaltyBy] = useState('spending')

  const today = new Date()

  function getDateRange(type) {
    switch (type) {
      case 'all_time': return { start: '2000-01-01', end: format(today, 'yyyy-MM-dd') }
      case 'this_year': return { start: format(startOfYear(today), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') }
      case 'last_3_months': {
        const start = startOfMonth(subMonths(today, 2))
        return { start: format(start, 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') }
      }
      case 'this_month': return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') }
      case 'custom': return { start: customStart, end: customEnd }
      default: return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') }
    }
  }

  const fetchOrders = useCallback(async (type, cStart, cEnd) => {
    setLoading(true)
    const range = type === 'custom' ? { start: cStart, end: cEnd } : getDateRange(type)
    if (!range.start || !range.end) { setLoading(false); return }

    const { data } = await supabase
      .from('orders')
      .select(`*, customers(name, phone), order_items(*, order_item_options(*))`)
      .gte('created_at', `${range.start}T00:00:00`)
      .lte('created_at', `${range.end}T23:59:59`)
      .order('created_at', { ascending: true })

    if (data) setOrders(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchOrders(filterType, customStart, customEnd)
  }, [filterType])

  // --- KALKULASI ---

  const totalRevenuePotential = orders.reduce((sum, o) =>
    sum + o.order_items.reduce((s, oi) => s + oi.price_at_order * oi.quantity, 0), 0)

  const totalRevenuePaid = orders.filter(o => o.paid).reduce((sum, o) =>
    sum + o.order_items.reduce((s, oi) => s + oi.price_at_order * oi.quantity, 0), 0)

  const totalCups = orders.reduce((sum, o) =>
    sum + o.order_items.reduce((s, oi) => s + oi.quantity, 0), 0)

  const totalOrders = orders.length
  const totalUnpaid = totalRevenuePotential - totalRevenuePaid

  // Tren harian
  const dailyMap = {}
  orders.forEach(o => {
    const date = o.created_at.split('T')[0]
    if (!dailyMap[date]) dailyMap[date] = { cups: 0, revenue: 0, paid: 0 }
    o.order_items.forEach(oi => {
      dailyMap[date].cups += oi.quantity
      dailyMap[date].revenue += oi.price_at_order * oi.quantity
      if (o.paid) dailyMap[date].paid += oi.price_at_order * oi.quantity
    })
  })
  const dailyData = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
  const maxCups = Math.max(...dailyData.map(([, d]) => d.cups), 1)
  const maxRevenue = Math.max(...dailyData.map(([, d]) => d.revenue), 1)

  // Per menu
  const menuMap = {}
  orders.forEach(o => {
    o.order_items.forEach(oi => {
      if (!menuMap[oi.menu_item_name]) menuMap[oi.menu_item_name] = { cups: 0, revenue: 0, paid: 0 }
      menuMap[oi.menu_item_name].cups += oi.quantity
      menuMap[oi.menu_item_name].revenue += oi.price_at_order * oi.quantity
      if (o.paid) menuMap[oi.menu_item_name].paid += oi.price_at_order * oi.quantity
    })
  })
  const menuData = Object.entries(menuMap).sort(([, a], [, b]) => b.cups - a.cups)
  const maxMenuCups = Math.max(...menuData.map(([, d]) => d.cups), 1)

  // Per customer
  const customerMap = {}
  orders.forEach(o => {
    const key = o.customers?.phone
    if (!key) return
    if (!customerMap[key]) customerMap[key] = { name: o.customers?.name, phone: key, cups: 0, revenue: 0, frequency: 0 }
    customerMap[key].frequency += 1
    o.order_items.forEach(oi => {
      customerMap[key].cups += oi.quantity
      customerMap[key].revenue += oi.price_at_order * oi.quantity
    })
  })

  const customerData = Object.values(customerMap).sort((a, b) => {
    if (loyaltyBy === 'spending') return b.revenue - a.revenue
    if (loyaltyBy === 'cup') return b.cups - a.cups
    return b.frequency - a.frequency
  })
  const maxCustomer = Math.max(...customerData.map(c => loyaltyBy === 'spending' ? c.revenue : loyaltyBy === 'cup' ? c.cups : c.frequency), 1)

  const filterLabel = {
    all_time: 'All Time',
    this_year: 'Tahun Ini',
    last_3_months: '3 Bulan Terakhir',
    this_month: 'Bulan Ini',
    custom: 'Custom'
  }

  return (
    <div style={st.container}>
      <div style={st.card}>

        <div style={st.header}>
          <img src="https://haixnqmapezjikgpwjqh.supabase.co/storage/v1/object/public/assets/kopi%20ijo.png"
            alt="Kopi Ijø" style={{ height: '80px', objectFit: 'contain' }} />
        </div>

        <div style={st.greeting}>
          <div style={st.greetingName}>Analytics 📊</div>
          <div style={st.greetingMsg}>Pantau performa penjualan Kopi Ijø.</div>
        </div>

        {/* FILTER */}
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {['this_month', 'last_3_months', 'this_year', 'all_time', 'custom'].map(f => (
              <button key={f} style={{ ...st.filterBtn, ...(filterType === f ? st.filterBtnActive : {}) }}
                onClick={() => setFilterType(f)}>
                {filterLabel[f]}
              </button>
            ))}
          </div>

          {filterType === 'custom' && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <input style={{ ...st.input, flex: 1 }} type="date" value={customStart}
                onChange={e => setCustomStart(e.target.value)} />
              <input style={{ ...st.input, flex: 1 }} type="date" value={customEnd}
                onChange={e => setCustomEnd(e.target.value)} />
              <button style={st.btnSmall} onClick={() => fetchOrders('custom', customStart, customEnd)}>
                Tampilkan
              </button>
            </div>
          )}
        </div>

        {loading && <p style={{ color: '#5a5248', padding: '8px 16px', fontSize: '13px' }}>Memuat...</p>}

        <div style={{ padding: '0 16px 24px' }}>

          {/* OVERVIEW */}
          <div style={st.sectionTitle}>Overview</div>
          <div style={st.grid2}>
            <div style={st.metricCard}>
              <div style={st.metricLabel}>Total Cup Terjual</div>
              <div style={st.metricValue}>{totalCups}</div>
            </div>
            <div style={st.metricCard}>
              <div style={st.metricLabel}>Total Order</div>
              <div style={st.metricValue}>{totalOrders}</div>
            </div>
            <div style={st.metricCard}>
              <div style={st.metricLabel}>Revenue (Lunas)</div>
              <div style={{ ...st.metricValue, color: '#1a3d2b' }}>Rp {totalRevenuePaid.toLocaleString('id-ID')}</div>
            </div>
            <div style={st.metricCard}>
              <div style={st.metricLabel}>Revenue (Potensi)</div>
              <div style={{ ...st.metricValue, color: '#5a5248' }}>Rp {totalRevenuePotential.toLocaleString('id-ID')}</div>
            </div>
          </div>

          {totalUnpaid > 0 && (
            <div style={st.unpaidBox}>
              ⚠️ Outstanding belum dibayar: <strong>Rp {totalUnpaid.toLocaleString('id-ID')}</strong>
            </div>
          )}

          {/* TREN HARIAN */}
          {dailyData.length > 0 && (
            <>
              <div style={st.sectionTitle}>Tren Harian</div>
              <div style={st.tableBox}>
                <div style={st.tableHeader}>
                  <span style={{ flex: 2 }}>Tanggal</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>Cup</span>
                  <span style={{ flex: 2, textAlign: 'right' }}>Revenue</span>
                </div>
                {dailyData.map(([date, d]) => (
                  <div key={date}>
                    <div style={st.tableRow}>
                      <span style={{ flex: 2, fontSize: '12px', color: '#2c2c2a' }}>
                        {format(parseISO(date), 'EEE, d MMM yyyy', { locale: id })}
                      </span>
                      <span style={{ flex: 1, textAlign: 'right', fontSize: '12px', color: '#2c2c2a' }}>{d.cups}</span>
                      <span style={{ flex: 2, textAlign: 'right', fontSize: '12px', color: '#1a3d2b' }}>
                        Rp {d.revenue.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div style={{ padding: '0 12px 6px' }}>
                      <div style={st.barBg}>
                        <div style={{ ...st.barFill, width: `${(d.cups / maxCups) * 100}%`, background: '#1a3d2b' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* PER MENU */}
          {menuData.length > 0 && (
            <>
              <div style={st.sectionTitle}>Menu Terlaris</div>
              <div style={st.tableBox}>
                <div style={st.tableHeader}>
                  <span style={{ flex: 3 }}>Menu</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>Cup</span>
                  <span style={{ flex: 2, textAlign: 'right' }}>Revenue</span>
                </div>
                {menuData.map(([name, d]) => (
                  <div key={name}>
                    <div style={st.tableRow}>
                      <span style={{ flex: 3, fontSize: '12px', color: '#2c2c2a' }}>{name}</span>
                      <span style={{ flex: 1, textAlign: 'right', fontSize: '12px', color: '#2c2c2a' }}>{d.cups}</span>
                      <span style={{ flex: 2, textAlign: 'right', fontSize: '12px', color: '#1a3d2b' }}>
                        Rp {d.revenue.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div style={{ padding: '0 12px 6px' }}>
                      <div style={st.barBg}>
                        <div style={{ ...st.barFill, width: `${(d.cups / maxMenuCups) * 100}%`, background: '#2d7a4f' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* CUSTOMER LOYALTY */}
          {customerData.length > 0 && (
            <>
              <div style={st.sectionTitle}>Customer</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                {[['spending', 'By Spending'], ['cup', 'By Cup'], ['frequency', 'By Frekuensi']].map(([v, label]) => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: '#2c2c2a', cursor: 'pointer' }}>
                    <input type="radio" name="loyalty" value={v} checked={loyaltyBy === v} onChange={() => setLoyaltyBy(v)} />
                    {label}
                  </label>
                ))}
              </div>
              <div style={st.tableBox}>
                <div style={st.tableHeader}>
                  <span style={{ flex: 2 }}>Customer</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>
                    {loyaltyBy === 'spending' ? 'Total' : loyaltyBy === 'cup' ? 'Cup' : 'Order'}
                  </span>
                </div>
                {customerData.map(c => {
                  const val = loyaltyBy === 'spending' ? c.revenue : loyaltyBy === 'cup' ? c.cups : c.frequency
                  const valLabel = loyaltyBy === 'spending' ? `Rp ${c.revenue.toLocaleString('id-ID')}` : val
                  return (
                    <div key={c.phone}>
                      <div style={st.tableRow}>
                        <div style={{ flex: 2 }}>
                          <div style={{ fontSize: '12px', color: '#2c2c2a', fontWeight: '500' }}>{c.name}</div>
                          <div style={{ fontSize: '11px', color: '#888' }}>{c.phone}</div>
                        </div>
                        <span style={{ flex: 1, textAlign: 'right', fontSize: '12px', color: '#1a3d2b', fontWeight: '500' }}>
                          {valLabel}
                        </span>
                      </div>
                      <div style={{ padding: '0 12px 6px' }}>
                        <div style={st.barBg}>
                          <div style={{ ...st.barFill, width: `${(val / maxCustomer) * 100}%`, background: '#6f4e37' }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {orders.length === 0 && !loading && (
            <p style={{ color: '#5a5248', textAlign: 'center', marginTop: '32px' }}>Tidak ada data di periode ini.</p>
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
  filterBtn: { padding: '6px 12px', border: '1px solid #c5bfb7', borderRadius: '20px', background: '#e4ddd2', cursor: 'pointer', fontSize: '12px', color: '#5a5248' },
  filterBtnActive: { background: '#1a3d2b', color: '#e8f0e2', borderColor: '#1a3d2b' },
  input: { padding: '8px 10px', fontSize: '13px', border: '1px solid #c5bfb7', borderRadius: '8px', background: '#f7f3ee', color: '#2c2c2a', marginBottom: 0, boxSizing: 'border-box' },
  btnSmall: { padding: '8px 14px', background: '#1a3d2b', color: '#e8f0e2', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' },
  sectionTitle: { fontSize: '14px', fontWeight: '500', color: '#1a3d2b', margin: '20px 0 10px', paddingBottom: '6px', borderBottom: '1.5px solid #1a3d2b' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' },
  metricCard: { background: '#f7f3ee', border: '0.5px solid #d6cfc4', borderRadius: '10px', padding: '12px' },
  metricLabel: { fontSize: '11px', color: '#888', marginBottom: '4px' },
  metricValue: { fontSize: '18px', fontWeight: '500', color: '#2c2c2a' },
  unpaidBox: { background: '#fef3e2', border: '1px solid #e67e22', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#7d3c00', marginBottom: '8px' },
  tableBox: { background: '#f7f3ee', border: '0.5px solid #d6cfc4', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' },
  tableHeader: { display: 'flex', padding: '8px 12px', background: '#e4ddd2', fontSize: '11px', color: '#888', fontWeight: '500' },
  tableRow: { display: 'flex', padding: '8px 12px 4px', alignItems: 'center' },
  barBg: { height: '4px', background: '#d6cfc4', borderRadius: '2px', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '2px', transition: 'width 0.3s ease' },
}

export default AnalyticsPage