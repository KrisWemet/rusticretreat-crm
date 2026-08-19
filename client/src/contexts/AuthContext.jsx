import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)

// Anything a couple or the public reaches without signing in. Kept next to the
// router config in App.jsx — a new public page must be added here too, or it
// will silently redirect to the staff login.
const PUBLIC_ROUTES = [
  /^\/sign\//,       // contract signing links
  /^\/proposal\//,   // proposal review links
  /^\/inquire\/?$/,  // public enquiry form
]

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
    // Routes reached by people who are not and never will be logged in: a couple
    // opening their contract signing link, a couple viewing a proposal, and the
    // public enquiry form. Without this the guard bounced all three to the staff
    // login screen, which made every signing link we emailed a dead end — the
    // API was answering correctly the whole time, so it only showed up by
    // opening one of those links in a browser with no session.
    const isPublicRoute = PUBLIC_ROUTES.some(r => r.test(location.pathname))

    if (!isPublicRoute && !isPortalRoute && !isAdminLoginRoute && !user) {
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

  // A stored token that the server no longer accepts — expired, or signed with a
  // previous JWT_SECRET — used to leave the app in its worst possible state:
  // localStorage still "proves" a login, so the route guard passes and the
  // dashboard renders the user's name, while every request behind it fails.
  // Nothing recovered from that except manually clearing site data.
  //
  // Guarded by a ref because a screen fires several requests at once and each
  // one rejects; without it the user gets a stack of identical toasts.
  const expiring = useRef(false)
  const endSession = useCallback(() => {
    if (expiring.current) return
    expiring.current = true
    localStorage.removeItem('adminToken')
    localStorage.removeItem('adminUser')
    delete axios.defaults.headers.common['Authorization']
    setUser(null)
    toast.error('Your session has expired — please sign in again.')
    navigate('/login', { replace: true })
    setTimeout(() => { expiring.current = false }, 3000)
  }, [navigate])

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
    const instance = axios.create({
      headers: { Authorization: `Bearer ${token}` }
    })
    instance.interceptors.response.use(r => r, err => {
      if (err.response?.status === 401) endSession()
      return Promise.reject(err)
    })
    return instance
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
