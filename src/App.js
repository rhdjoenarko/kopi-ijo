import { BrowserRouter, Routes, Route } from 'react-router-dom'
import CustomerPage from './pages/CustomerPage'
import AdminPage from './pages/AdminPage'
import AnalyticsPage from './pages/AnalyticsPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CustomerPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App