import { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [couple, setCouple] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // Check for existing admin token
    const token = localStorage.getItem('adminToken')
    const userData = localStorage.getItem('adminUser')
    if (token && userData) {
      setUser(JSON.parse(userData))
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }

    // Check for existing couple token
    const coupleToken = localStorage.getItem('coupleToken')
    const coupleData = localStorage.getItem('coupleData')
    if (coupleToken && coupleData) {
      setCouple(JSON.parse(coupleData))
    }

    setLoading(false)
  }, [])

  // Protect admin routes
  useEffect(() => {
    if (loading) return
    const isPortalRoute = location.pathname.startsWith('/portal')
    const isAdminLoginRoute = location.pathname === '/login'
    const isPortalLoginRoute = location.pathname === '/portal/login'

    if (!isPortalRoute && !isAdminLoginRoute && !user) {
      navigate('/login', { replace: true })
    }

    if (isPortalRoute && !isPortalLoginRoute && !couple) {
      navigate('/portal/login', { replace: true })
    }
  }, [loading, user, couple, location.pathname])

  const loginAdmin = async (email, password) => {
    const response = await axios.post('/api/auth/login', { email, password })
    const { token, user: userData } = response.data
    localStorage.setItem('adminToken', token)
    localStorage.setItem('adminUser', JSON.stringify(userData))
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    setUser(userData)
    return userData
  }

  const loginCouple = async (email, password) => {
    const response = await axios.post('/api/auth/couple-login', { email, password })
    const { token, couple: coupleData } = response.data
    localStorage.setItem('coupleToken', token)
    localStorage.setItem('coupleData', JSON.stringify(coupleData))
    setCouple(coupleData)
    return coupleData
  }

  const logoutAdmin = () => {
    localStorage.removeItem('adminToken')
    localStorage.removeItem('adminUser')
    delete axios.defaults.headers.common['Authorization']
    setUser(null)
    navigate('/login')
  }

  const logoutCouple = () => {
    localStorage.removeItem('coupleToken')
    localStorage.removeItem('coupleData')
    setCouple(null)
    navigate('/portal/login')
  }

  const getAdminAxios = () => {
    const token = localStorage.getItem('adminToken')
    return axios.create({
      headers: { Authorization: `Bearer ${token}` }
    })
  }

  const getCoupleAxios = () => {
    const token = localStorage.getItem('coupleToken')
    return axios.create({
      headers: { Authorization: `Bearer ${token}` }
    })
  }

  return (
    <AuthContext.Provider value={{
      user, couple, loading,
      loginAdmin, loginCouple,
      logoutAdmin, logoutCouple,
      getAdminAxios, getCoupleAxios
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
