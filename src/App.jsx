import { useEffect, useState, useRef } from 'react'
import supabase from './supabase'
import { MapPin, User, Plus, Trash2, CalendarDays, Sun, Moon, ThumbsUp, AlertCircle } from 'lucide-react'

const DESC_LIMIT = 200

const CATEGORIES = ['Food Pantry', 'Hot Meal', 'Groceries', 'Mobile Pantry', 'SNAP/CalFresh', 'Baby & Infant', 'Senior Services', 'Other']

function App() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedDescriptions, setExpandedDescriptions] = useState({})
  const [darkMode, setDarkMode] = useState(true)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showPastEvents, setShowPastEvents] = useState(false)
  
  // Map State
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef({})
  const [mapLoaded, setMapLoaded] = useState(!!window.google?.maps)
  
  // Active Post State (Map Sync)
  const [activePostId, setActivePostId] = useState(null)
  const postRefs = useRef({})

  // Form State — mirrors posts schema exactly
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formFeedback, setFormFeedback] = useState({ type: '', message: '' })
  const [occurrences, setOccurrences] = useState([{ start_time: '', end_time: '', notes: '' }])
  const [formData, setFormData] = useState({
    title: '', description: '', category: '',
    address: '', city: '', zip: '',
    image_url: '', tags: '',
    expires_at: '', is_active: true
  })

  // Repeating event state
  const [isRepeating, setIsRepeating] = useState(false)
  const [repeatConfig, setRepeatConfig] = useState({
    startDate: '',      // date string YYYY-MM-DD
    startTime: '',      // time string HH:MM
    endTime: '',        // time string HH:MM (optional)
    pattern: 'weekly', // weekly | biweekly | monthly-date | monthly-weekday
    // monthly-weekday fields
    weekdayOrdinal: '1', // 1=First, 2=Second, 3=Third, 4=Fourth, 5=Last
    weekday: '1',        // 0=Sun … 6=Sat
    notes: ''
  })

  const fetchPosts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('posts')
      .select('*, post_occurrences(*)')
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.now()')

    if (error) {
      console.error(error)
      setError(error.message)
    } else {
      // Smart Feed Sorting
      const now = new Date()
      
      const processedPosts = (data || []).map(post => {
        const validOccurrences = (post.post_occurrences || [])
          .filter(o => !o.is_cancelled && (!o.expires_at || new Date(o.expires_at) > now))
          .map(o => ({
            ...o,
            startDate: new Date(o.start_time),
            endDate: o.end_time ? new Date(o.end_time) : null
          }))
          
        validOccurrences.sort((a, b) => a.startDate - b.startDate)

        // Fallback: events stored directly on posts table (no post_occurrences rows)
        if (validOccurrences.length === 0 && post.start_time) {
          validOccurrences.push({
            startDate: new Date(post.start_time),
            endDate: post.end_time ? new Date(post.end_time) : null,
            start_time: post.start_time,
            end_time: post.end_time,
            is_cancelled: false,
            notes: null
          })
        }

        let status = 'none'
        let nextOccurrence = null
        let futureCount = 0

        // Happening Now check
        const currentNow = validOccurrences.find(o => {
           if (o.startDate > now) return false;
           if (o.endDate && o.endDate >= now) return true;
           // If no end date, treat as happening today
           if (!o.endDate && o.startDate.toDateString() === now.toDateString()) return true; 
           return false;
        })

        if (currentNow) {
          status = 'now'
          nextOccurrence = currentNow
          futureCount = validOccurrences.filter(o => o.startDate > now).length
        } else {
          const upcoming = validOccurrences.filter(o => o.startDate > now)
          if (upcoming.length > 0) {
            status = 'upcoming'
            nextOccurrence = upcoming[0]
            futureCount = upcoming.length - 1
          }
        }

        return { ...post, status, nextOccurrence, futureCount, validOccurrences }
      })

      // Sort
      processedPosts.sort((a, b) => {
        // Priority 1: Happening Now
        if (a.status === 'now' && b.status !== 'now') return -1
        if (b.status === 'now' && a.status !== 'now') return 1
        
        // Priority 2: Upcoming Soon
        if (a.status === 'upcoming' && b.status === 'upcoming') {
          return a.nextOccurrence.startDate - b.nextOccurrence.startDate
        }
        if (a.status === 'upcoming' && b.status !== 'upcoming') return -1
        if (b.status === 'upcoming' && a.status !== 'upcoming') return 1
        
        // Priority 3: Evergreen (none)
        return new Date(b.created_at) - new Date(a.created_at)
      })

      setPosts(processedPosts)
    }
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPosts()
  }, [])

  // Google Maps Load
  useEffect(() => {
    if (window.google?.maps) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMapLoaded(true)
      return
    }
    const handleMapLoad = () => setMapLoaded(true)
    window.addEventListener('google-maps-loaded', handleMapLoad)
    return () => window.removeEventListener('google-maps-loaded', handleMapLoad)
  }, [])

  // Initialize Map & Markers
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return

    if (!mapInstance.current) {
      mapInstance.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 32.7157, lng: -117.1611 },
        zoom: 10,
        styles: [ 
          { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#020617' }] },
          { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
          { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#334155' }] },
        ],
        disableDefaultUI: true,
        zoomControl: true,
      })
    }

    const map = mapInstance.current
    const geocoder = new window.google.maps.Geocoder()

    // Clear old markers
    Object.values(markersRef.current).forEach(m => m.setMap(null))
    markersRef.current = {}

    posts.forEach((post) => {
      const addMarker = (location) => {
        const marker = new window.google.maps.Marker({
          position: location,
          map,
          title: post.title,
        })
        
        marker.addListener('click', () => {
          setActivePostId(post.id)
          if (postRefs.current[post.id]) {
            postRefs.current[post.id].scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        })

        markersRef.current[post.id] = marker
      }

      if (post.latitude && post.longitude) {
        addMarker({ lat: post.latitude, lng: post.longitude })
      } else if (post.address) {
        const fullAddress = `${post.address}, ${post.city || 'San Diego'}, CA`
        geocoder.geocode({ address: fullAddress }, (results, status) => {
          if (status === 'OK' && results[0]) {
            addMarker(results[0].geometry.location)
          }
        })
      }
    })
  }, [posts, mapLoaded]) // Re-run when posts fetch

  // Handle marker highlight sync
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      if (id === activePostId) {
        marker.setAnimation(window.google.maps.Animation.BOUNCE)
        marker.setIcon('http://maps.google.com/mapfiles/ms/icons/blue-dot.png')
        mapInstance.current?.panTo(marker.getPosition())
      } else {
        marker.setAnimation(null)
        marker.setIcon('http://maps.google.com/mapfiles/ms/icons/red-dot.png')
      }
    })
  }, [activePostId])

  const handleAddOccurrence = () => {
    setOccurrences([...occurrences, { start_time: '', end_time: '', notes: '' }])
  }

  const handleRemoveOccurrence = (index) => {
    setOccurrences(occurrences.filter((_, i) => i !== index))
  }

  const handleOccurrenceChange = (index, field, value) => {
    const updated = [...occurrences]
    updated[index][field] = value
    setOccurrences(updated)
  }

  const handleField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  // --- Recurring occurrence generator ---
  const generateOccurrences = () => {
    const { startDate, startTime, endTime, pattern, weekdayOrdinal, weekday, notes } = repeatConfig
    if (!startDate || !startTime) return []

    const endOfYear = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59)
    const results = []

    const buildISO = (date, time) => {
      if (!time) return null
      const [h, m] = time.split(':').map(Number)
      const d = new Date(date)
      d.setHours(h, m, 0, 0)
      return d.toISOString()
    }

    // Helper: nth weekday of month (ordinal 1-4, or 5=last)
    const nthWeekdayOfMonth = (year, month, wday, ordinal) => {
      if (ordinal === 5) {
        // Last occurrence
        const last = new Date(year, month + 1, 0)
        while (last.getDay() !== wday) last.setDate(last.getDate() - 1)
        return new Date(last)
      }
      const first = new Date(year, month, 1)
      const diff = (wday - first.getDay() + 7) % 7
      const d = new Date(year, month, 1 + diff + (ordinal - 1) * 7)
      return d.getMonth() === month ? d : null
    }

    if (pattern === 'weekly' || pattern === 'biweekly') {
      const step = pattern === 'biweekly' ? 14 : 7
      let cur = new Date(startDate + 'T00:00:00')
      while (cur <= endOfYear) {
        results.push(cur)
        cur = new Date(cur)
        cur.setDate(cur.getDate() + step)
      }
    } else if (pattern === 'monthly-date') {
      // Same calendar date each month
      const anchor = new Date(startDate + 'T00:00:00')
      const dayNum = anchor.getDate()
      let month = anchor.getMonth()
      let year = anchor.getFullYear()
      while (true) {
        const d = new Date(year, month, dayNum)
        if (d > endOfYear) break
        if (d >= anchor) results.push(d)
        month++
        if (month > 11) { month = 0; year++ }
      }
    } else if (pattern === 'monthly-weekday') {
      const anchor = new Date(startDate + 'T00:00:00')
      let month = anchor.getMonth()
      let year = anchor.getFullYear()
      const wday = parseInt(weekday, 10)
      const ord = parseInt(weekdayOrdinal, 10)
      while (true) {
        const d = nthWeekdayOfMonth(year, month, wday, ord)
        if (!d || d > endOfYear) { month++; if (month > 11) { month = 0; year++ }; if (year > endOfYear.getFullYear()) break; continue }
        if (d >= anchor) results.push(d)
        month++
        if (month > 11) { month = 0; year++ }
        if (year > endOfYear.getFullYear()) break
      }
    }

    return results.map(d => ({
      date: d,
      start_time: buildISO(d, startTime),
      end_time: endTime ? buildISO(d, endTime) : null,
      notes: notes || null
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setFormFeedback({ type: '', message: '' })

    const tagsArray = formData.tags
      ? formData.tags.split(',').map(t => t.trim()).filter(Boolean)
      : null

    const newPost = {
      title: formData.title,
      description: formData.description || null,
      category: formData.category || null,
      address: formData.address || null,
      city: formData.city || null,
      zip: formData.zip || null,
      website_url: formData.website_url || null,
      tags: tagsArray,
      expires_at: formData.expires_at ? new Date(formData.expires_at).toISOString() : null,
      is_active: formData.is_active
    }

    const { data: insertedPost, error: postError } = await supabase
      .from('posts')
      .insert([newPost])
      .select()

    if (postError) {
      setFormFeedback({ type: 'error', message: postError.message })
      setIsSubmitting(false)
      return
    }

    if (insertedPost && insertedPost.length > 0) {
      const postId = insertedPost[0].id
      let occsToInsert = []

      if (isRepeating) {
        const generated = generateOccurrences()
        if (generated.length === 0) {
          setFormFeedback({ type: 'error', message: 'Repeating event: no occurrences could be generated. Check start date and pattern.' })
          setIsSubmitting(false)
          return
        }
        occsToInsert = generated.map(o => ({ post_id: postId, start_time: o.start_time, end_time: o.end_time, notes: o.notes }))
      } else {
        occsToInsert = occurrences.filter(o => o.start_time).map(o => ({
          post_id: postId,
          start_time: new Date(o.start_time).toISOString(),
          end_time: o.end_time ? new Date(o.end_time).toISOString() : null,
          notes: o.notes || null
        }))
      }

      if (occsToInsert.length > 0) {
        const { error: occError } = await supabase.from('post_occurrences').insert(occsToInsert)
        if (occError) {
          setFormFeedback({ type: 'error', message: `Post saved, but dates failed: ${occError.message}` })
          setIsSubmitting(false)
          return
        }
      }
    }

    const count = isRepeating ? generateOccurrences().length : occurrences.filter(o => o.start_time).length
    setFormFeedback({ type: 'success', message: `✅ Resource posted with ${count} occurrence${count !== 1 ? 's' : ''}!` })
    setFormData({ title: '', description: '', category: '', address: '', city: '', zip: '', image_url: '', tags: '', expires_at: '', is_active: true })
    setOccurrences([{ start_time: '', end_time: '', notes: '' }])
    setIsRepeating(false)
    setRepeatConfig({ startDate: '', startTime: '', endTime: '', pattern: 'weekly', weekdayOrdinal: '1', weekday: '1', notes: '' })
    fetchPosts()
    setIsSubmitting(false)
  }

  const formatDate = (date) => {
    if (!date) return ''
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(date)
  }

  // --- Date helpers (timezone-safe, local date) ---
  const getLocalToday = () => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }

  const getEndOfWeek = () => {
    const today = getLocalToday()
    const day = today.getDay() // 0=Sun
    const diff = 6 - day // days until Saturday
    const eow = new Date(today)
    eow.setDate(today.getDate() + diff)
    eow.setHours(23, 59, 59, 999)
    return eow
  }

  const getEventDate = (post) => {
    if (post.nextOccurrence?.startDate) return post.nextOccurrence.startDate
    // fallback: earliest valid occurrence
    if (post.validOccurrences?.length > 0) return post.validOccurrences[0].startDate
    return null
  }

  const isEventToday = (post) => {
    const d = getEventDate(post)
    if (!d) return false
    const today = getLocalToday()
    return d >= today && d < new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  }

  const isEventThisWeek = (post) => {
    const d = getEventDate(post)
    if (!d) return false
    const today = getLocalToday()
    const eow = getEndOfWeek()
    return d >= today && d <= eow
  }

  const isEventPast = (post) => {
    const d = getEventDate(post)
    if (!d) return false
    return d < getLocalToday()
  }

  // Build the two lists: upcoming this week + past
  const upcomingPosts = posts
    .filter(p => getEventDate(p) !== null && isEventThisWeek(p))
    .sort((a, b) => getEventDate(a) - getEventDate(b))

  const pastPosts = posts
    .filter(p => getEventDate(p) !== null && isEventPast(p))
    .sort((a, b) => getEventDate(b) - getEventDate(a))

  const visiblePosts = showPastEvents
    ? [...upcomingPosts, ...pastPosts]
    : upcomingPosts

  return (
    <div className={`${darkMode ? 'dark' : ''} min-h-screen font-sans selection:bg-amber-500/30 pb-20 dark:bg-slate-950 dark:text-slate-200 transition-colors duration-300`} style={darkMode ? {} : { backgroundColor: 'var(--ecc-cream)', color: 'var(--ecc-text)' }}>
      <header className="w-full border-b pt-16 pb-12 px-6 dark:from-indigo-950 dark:via-purple-950 dark:to-slate-950 dark:border-indigo-500/20 dark:bg-gradient-to-r"
        style={darkMode ? {} : { backgroundColor: 'var(--ecc-steel)', borderColor: '#3D6882' }}
      >
        <div className="max-w-6xl mx-auto relative">
          {/* Header Controls */}
          <div className="absolute top-0 right-0 flex items-center gap-2">
            <button
              onClick={() => setShowAdmin(!showAdmin)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-200 shadow-sm backdrop-blur-sm ${
                showAdmin
                  ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500'
                  : 'bg-white/70 dark:bg-slate-800/70 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700'
              }`}
            >
              {showAdmin ? '✕ Hide Admin' : '⚙ Admin Panel'}
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle colour mode"
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-200
                bg-white/70 dark:bg-slate-800/70 border-slate-300 dark:border-slate-700
                text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 shadow-sm backdrop-blur-sm"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
              {darkMode ? 'Light' : 'Dark'}
            </button>
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-indigo-200 dark:to-purple-200"
            style={darkMode ? {} : { color: '#FFFFFF' }}
          >
            East County Food Access Network
          </h1>
          <p className="text-lg md:text-xl max-w-2xl font-medium dark:text-indigo-200/80"
            style={darkMode ? {} : { color: 'rgba(255,255,255,0.85)' }}
          >
            Share food donations and pickup info across East San Diego County.
            Connect with your community to reduce waste and fight hunger.
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          <div className="lg:col-span-8 space-y-8">
            <div 
              ref={mapRef}
              className="border dark:bg-slate-900 dark:border-slate-800 rounded-3xl min-h-[350px] shadow-lg shadow-black/10 dark:shadow-black/20 overflow-hidden relative"
              style={darkMode ? {} : { backgroundColor: 'var(--ecc-steel-light)', borderColor: 'var(--ecc-steel-border)' }}
            >
              {!mapLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center dark:bg-slate-900 z-10" style={darkMode ? {} : { backgroundColor: 'var(--ecc-steel-light)' }}>
                  <MapPin className="w-12 h-12 text-slate-400 dark:text-slate-600 mb-4 animate-pulse" />
                  <h3 className="text-xl font-semibold text-slate-500 dark:text-slate-400">Loading Map...</h3>
                </div>
              )}
            </div>

            <div className="border-b dark:border-slate-800 pb-4" style={darkMode ? {} : { borderColor: 'var(--ecc-steel-border)' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-2xl font-bold dark:text-slate-100" style={darkMode ? {} : { color: 'var(--ecc-text)' }}>Upcoming Events This Week</h2>
                <span className="text-sm font-medium dark:text-slate-400 dark:bg-slate-900 px-3 py-1 rounded-full dark:border-slate-800 border"
                  style={darkMode ? {} : { color: 'var(--ecc-steel)', backgroundColor: 'var(--ecc-steel-light)', borderColor: 'var(--ecc-steel-border)' }}
                >
                  {visiblePosts.length} {visiblePosts.length === 1 ? 'Event' : 'Events'}
                </span>
              </div>
              <button
                onClick={() => setShowPastEvents(prev => !prev)}
                className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-1.5 rounded-full border transition-all duration-200 ${
                  showPastEvents
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30'
                    : 'dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
                style={!darkMode && !showPastEvents ? { backgroundColor: 'var(--ecc-steel-light)', borderColor: 'var(--ecc-steel-border)', color: 'var(--ecc-steel)' } : {}}
              >
                <span className={`w-2 h-2 rounded-full transition-colors ${showPastEvents ? 'bg-amber-400' : 'bg-slate-400'}`} />
                {showPastEvents ? 'Hiding Past Events' : 'Show Past Events'}
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-pulse flex space-x-2 items-center text-indigo-400">
                  <div className="w-2 h-2 bg-indigo-400 rounded-full"></div>
                  <div className="w-2 h-2 bg-indigo-400 rounded-full"></div>
                  <div className="w-2 h-2 bg-indigo-400 rounded-full"></div>
                  <span className="ml-2 font-medium">Loading resources...</span>
                </div>
              </div>
            ) : error ? (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl">
                <p className="font-semibold">Error loading posts</p>
                <p className="text-sm opacity-80 mt-1">{error}</p>
              </div>
            ) : visiblePosts.length === 0 ? (
              <div className="p-12 rounded-3xl text-center shadow-lg border dark:bg-slate-900 dark:border-slate-800 dark:shadow-black/20"
                style={darkMode ? {} : { backgroundColor: '#F0EBE2', borderColor: 'var(--ecc-steel-border)' }}
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 dark:bg-slate-800" style={darkMode ? {} : { backgroundColor: 'var(--ecc-steel-light)' }}>
                  <CalendarDays className="w-8 h-8 dark:text-slate-500" style={darkMode ? {} : { color: 'var(--ecc-steel)' }} />
                </div>
                <h3 className="text-xl font-bold mb-2 dark:text-slate-300" style={darkMode ? {} : { color: 'var(--ecc-text)' }}>No upcoming events this week.</h3>
                <p className="text-sm" style={darkMode ? { color: '#94a3b8' } : { color: 'var(--ecc-text-muted)' }}>Check back soon or enable past events to view previous resources.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {visiblePosts.map((post) => {
                  const isActive = activePostId === post.id
                  const todayFlag = isEventToday(post)
                  const pastFlag = isEventPast(post)
                  return (
                    <article 
                      key={post.id} 
                      ref={el => postRefs.current[post.id] = el}
                      onClick={() => setActivePostId(post.id)}
                      className={`dark:bg-slate-900 border rounded-3xl overflow-hidden shadow-lg dark:shadow-xl shadow-black/10 dark:shadow-black/20 transition-all duration-300 group cursor-pointer ${
                        pastFlag ? 'opacity-60' : ''
                      } ${
                        isActive ? 'border-[var(--ecc-orange)] dark:border-indigo-500 ring-1 ring-[var(--ecc-orange)]/40 dark:ring-indigo-500/50' : 'dark:border-slate-800 dark:hover:border-slate-700'
                      }`}
                      style={darkMode ? {} : {
                        backgroundColor: '#F7F3EE',
                        borderColor: isActive ? 'var(--ecc-orange)' : 'var(--ecc-steel-border)'
                      }}
                    >

                      <div className="p-7">
                        <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className={`text-2xl font-bold leading-tight transition-colors ${isActive ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-300'}`}>
                              {post.title}
                            </h3>
                            {todayFlag && (
                              <span className="inline-flex items-center text-xs font-bold text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-500/15 px-2.5 py-1 rounded-lg border border-violet-200 dark:border-violet-500/25 whitespace-nowrap">
                                📅 Today
                              </span>
                            )}
                            {pastFlag && (
                              <span className="inline-flex items-center text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                Past Event
                              </span>
                            )}
                          </div>
                          
                          {/* Status Badges */}
                          <div className="flex flex-col items-end gap-2">
                            {post.status === 'now' && (
                              <span className="inline-flex items-center text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/20 whitespace-nowrap animate-pulse">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 mr-2"></span>
                                Happening Now
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-5 mb-6 border border-slate-100 dark:border-slate-700/50">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">
                            Pickup Details
                          </h4>
                          <div className="space-y-4">
                            {(post.status === 'upcoming' || post.status === 'now') && post.nextOccurrence ? (
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 bg-indigo-100 dark:bg-indigo-500/20 p-2 rounded-lg shrink-0">
                                  <CalendarDays className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-800 dark:text-slate-200 text-base">
                                    {formatDate(post.nextOccurrence.startDate)}
                                  </p>
                                  {post.nextOccurrence.end_time && (
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                                      Until {formatDate(new Date(post.nextOccurrence.end_time))}
                                    </p>
                                  )}
                                  {post.futureCount > 0 && (
                                    <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-1">
                                      +{post.futureCount} more upcoming date{post.futureCount > 1 ? 's' : ''}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 bg-slate-200 dark:bg-slate-800 p-2 rounded-lg shrink-0">
                                  <CalendarDays className="w-5 h-5 text-slate-400" />
                                </div>
                                <p className="font-medium text-slate-500 dark:text-slate-400 italic pt-1 text-sm">No upcoming dates scheduled</p>
                              </div>
                            )}

                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 bg-emerald-100 dark:bg-emerald-500/20 p-2 rounded-lg shrink-0">
                                <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                              </div>
                              <div>
                                {post.location_name && (
                                  <p className="font-semibold text-slate-800 dark:text-slate-200 text-base">{post.location_name}</p>
                                )}
                                <p className={`mt-0.5 ${!post.location_name ? 'font-semibold text-base text-slate-800 dark:text-slate-200' : 'text-sm text-slate-600 dark:text-slate-400'}`}>
                                  {post.address
                                    ? <>{post.address}{post.city ? `, ${post.city}` : ''}{post.zip ? ` ${post.zip}` : ''}</>
                                    : 'Address not provided'
                                  }
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {(() => {
                          const isLong = post.description && post.description.length > DESC_LIMIT
                          const isExpanded = !!expandedDescriptions[post.id]
                          return post.description ? (
                            <div className="mb-6">
                              <p className="text-slate-700 dark:text-slate-300 text-base leading-relaxed whitespace-pre-line">
                                {isLong && !isExpanded
                                  ? post.description.slice(0, DESC_LIMIT).trimEnd() + '…'
                                  : post.description}
                              </p>
                              {isLong && (
                                <button
                                  onClick={e => { e.stopPropagation(); setExpandedDescriptions(prev => ({ ...prev, [post.id]: !prev[post.id] })) }}
                                  className="mt-2 text-sm font-semibold text-indigo-500 hover:text-indigo-400 transition-colors"
                                >
                                  {isExpanded ? 'Show less ↑' : 'Read more ↓'}
                                </button>
                              )}
                            </div>
                          ) : null
                        })()}

                        <div className="flex items-center justify-between pt-5 border-t border-slate-200 dark:border-slate-800/60 mt-4">
                          {(post.author_name || post.organization_type) ? (
                            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                              <User className="w-4 h-4 opacity-70" />
                              <span>
                                {post.website_url ? (
                                  <a
                                    href={post.website_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
                                    style={darkMode ? {} : { color: 'var(--ecc-steel)' }}
                                  >
                                    {post.author_name || 'Visit Website'}
                                  </a>
                                ) : (
                                  <span className="font-medium text-slate-700 dark:text-slate-300">{post.author_name || 'Anonymous'}</span>
                                )}
                                {post.organization_type && <span className="opacity-70"> • {post.organization_type}</span>}
                              </span>
                            </div>
                          ) : (
                            <div></div>
                          )}

                          <div className="flex items-center gap-4">
                            <button 
                              onClick={(e) => { e.stopPropagation(); alert('Like functionality coming soon!') }}
                              className="flex items-center justify-center p-2 rounded-full text-slate-500 hover:bg-emerald-100 hover:text-emerald-600 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-400 transition-colors"
                              title="Like this resource"
                            >
                              <ThumbsUp className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); alert('Report functionality coming soon!') }}
                              className="flex items-center justify-center p-2 rounded-full text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition-colors"
                              title="Report this resource"
                            >
                              <AlertCircle className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right Column: Admin Panel */}
          {showAdmin && (
          <div className="lg:col-span-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl shadow-black/10 dark:shadow-black/20 sticky top-8">
              {/* Panel Header */}
              <div className="bg-indigo-600 dark:bg-indigo-700 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-white font-bold text-lg">⚙ Admin Panel</h2>
                  <p className="text-indigo-200 text-xs mt-0.5">Insert into Supabase → posts + post_occurrences</p>
                </div>
                <button onClick={() => setShowAdmin(false)} className="text-indigo-200 hover:text-white text-xl leading-none">✕</button>
              </div>

              <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
                {formFeedback.message && (
                  <div className={`p-3 rounded-xl text-sm border ${formFeedback.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                    {formFeedback.message}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Section: Core */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Core Info</p>
                    <div>
                      <label className="label">Title *</label>
                      <input required value={formData.title} onChange={e => handleField('title', e.target.value)} placeholder="e.g. Free Fresh Produce" className="field" />
                    </div>
                    <div>
                      <label className="label">Description</label>
                      <textarea value={formData.description} onChange={e => handleField('description', e.target.value)} rows={3} placeholder="What's available, requirements, quantities..." className="field resize-none" />
                    </div>
                    <div>
                      <label className="label">Category</label>
                      <select value={formData.category} onChange={e => handleField('category', e.target.value)} className="field">
                        <option value="">— Select category —</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Section: Location */}
                  <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Location</p>
                    <div>
                      <label className="label">Address</label>
                      <input value={formData.address} onChange={e => handleField('address', e.target.value)} placeholder="123 Main St" className="field" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">City</label>
                        <input value={formData.city} onChange={e => handleField('city', e.target.value)} placeholder="El Cajon" className="field" />
                      </div>
                      <div>
                        <label className="label">ZIP</label>
                        <input value={formData.zip} onChange={e => handleField('zip', e.target.value)} placeholder="92020" className="field" />
                      </div>
                    </div>
                  </div>

                  {/* Section: Event Schedule */}
                  <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Event Schedule</p>
                      {/* Repeating Event toggle */}
                      <button
                        type="button"
                        onClick={() => setIsRepeating(p => !p)}
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                          isRepeating
                            ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isRepeating ? 'bg-indigo-400' : 'bg-slate-400'}`} />
                        {isRepeating ? '↻ Repeating Event' : '↻ Repeating Event'}
                      </button>
                    </div>

                    {!isRepeating ? (
                      /* ── One-time / manual occurrences ── */
                      <div className="space-y-2">
                        {occurrences.map((occ, idx) => (
                          <div key={idx} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-500">Occurrence {idx + 1}</span>
                              {occurrences.length > 1 && (
                                <button type="button" onClick={() => handleRemoveOccurrence(idx)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                              )}
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase block mb-1">Start *</span>
                              <input type="datetime-local" value={occ.start_time} onChange={e => handleOccurrenceChange(idx, 'start_time', e.target.value)} className="field text-xs" />
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase block mb-1">End (optional)</span>
                              <input type="datetime-local" value={occ.end_time} onChange={e => handleOccurrenceChange(idx, 'end_time', e.target.value)} className="field text-xs" />
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase block mb-1">Notes (optional)</span>
                              <input value={occ.notes} onChange={e => handleOccurrenceChange(idx, 'notes', e.target.value)} placeholder="e.g. Bring ID" className="field text-xs" />
                            </div>
                          </div>
                        ))}
                        <button type="button" onClick={handleAddOccurrence} className="text-xs flex items-center gap-1 text-indigo-500 hover:text-indigo-400 font-semibold pt-1">
                          <Plus className="w-3 h-3" /> Add Another Date
                        </button>
                      </div>
                    ) : (
                      /* ── Repeating event config ── */
                      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 space-y-3">
                        <p className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider">Recurrence Settings</p>

                        {/* Start date + times */}
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase block mb-1">First Occurrence Date *</span>
                          <input
                            type="date"
                            value={repeatConfig.startDate}
                            onChange={e => setRepeatConfig(p => ({ ...p, startDate: e.target.value }))}
                            className="field text-xs"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase block mb-1">Start Time *</span>
                            <input
                              type="time"
                              value={repeatConfig.startTime}
                              onChange={e => setRepeatConfig(p => ({ ...p, startTime: e.target.value }))}
                              className="field text-xs"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase block mb-1">End Time (opt.)</span>
                            <input
                              type="time"
                              value={repeatConfig.endTime}
                              onChange={e => setRepeatConfig(p => ({ ...p, endTime: e.target.value }))}
                              className="field text-xs"
                            />
                          </div>
                        </div>

                        {/* Pattern selector */}
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase block mb-1">Recurring Every…</span>
                          <select
                            value={repeatConfig.pattern}
                            onChange={e => setRepeatConfig(p => ({ ...p, pattern: e.target.value }))}
                            className="field text-xs"
                          >
                            <option value="weekly">Every week (same day)</option>
                            <option value="biweekly">Every 2 weeks (biweekly)</option>
                            <option value="monthly-date">Monthly – same date (e.g. 15th each month)</option>
                            <option value="monthly-weekday">Monthly – specific weekday (e.g. First Thursday)</option>
                          </select>
                        </div>

                        {/* Monthly-weekday sub-fields */}
                        {repeatConfig.pattern === 'monthly-weekday' && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase block mb-1">Which occurrence</span>
                              <select
                                value={repeatConfig.weekdayOrdinal}
                                onChange={e => setRepeatConfig(p => ({ ...p, weekdayOrdinal: e.target.value }))}
                                className="field text-xs"
                              >
                                <option value="1">First</option>
                                <option value="2">Second</option>
                                <option value="3">Third</option>
                                <option value="4">Fourth</option>
                                <option value="5">Last</option>
                              </select>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase block mb-1">Weekday</span>
                              <select
                                value={repeatConfig.weekday}
                                onChange={e => setRepeatConfig(p => ({ ...p, weekday: e.target.value }))}
                                className="field text-xs"
                              >
                                <option value="0">Sunday</option>
                                <option value="1">Monday</option>
                                <option value="2">Tuesday</option>
                                <option value="3">Wednesday</option>
                                <option value="4">Thursday</option>
                                <option value="5">Friday</option>
                                <option value="6">Saturday</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {/* Notes */}
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase block mb-1">Notes (optional)</span>
                          <input
                            value={repeatConfig.notes}
                            onChange={e => setRepeatConfig(p => ({ ...p, notes: e.target.value }))}
                            placeholder="e.g. Bring ID, first come first served"
                            className="field text-xs"
                          />
                        </div>

                        {/* Preview count */}
                        {repeatConfig.startDate && repeatConfig.startTime && (() => {
                          const count = generateOccurrences().length
                          return (
                            <p className="text-xs text-indigo-400 font-semibold">
                              ↻ Will create <span className="text-indigo-300">{count}</span> occurrence{count !== 1 ? 's' : ''} through Dec 31, {new Date().getFullYear()}
                            </p>
                          )
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Section: Media & Tags */}
                  <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Media & Tags</p>
                    <div>
                      <label className="label">Website URL <span className="normal-case font-normal text-slate-400">(organization's site)</span></label>
                      <input value={formData.website_url} onChange={e => handleField('website_url', e.target.value)} type="url" placeholder="https://example.org" className="field" />
                    </div>
                    <div>
                      <label className="label">Tags <span className="normal-case font-normal text-slate-400">(comma-separated)</span></label>
                      <input value={formData.tags} onChange={e => handleField('tags', e.target.value)} placeholder="Hot Meal, Vegan, Walk-in" className="field" />
                    </div>
                  </div>

                  {/* Section: Settings */}
                  <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Settings</p>
                    <div>
                      <label className="label">Expires At <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                      <input value={formData.expires_at} onChange={e => handleField('expires_at', e.target.value)} type="datetime-local" className="field" />
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <div className={`relative w-10 h-5 rounded-full transition-colors ${formData.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                      <input type="checkbox" checked={formData.is_active} onChange={e => handleField('is_active', e.target.checked)} className="sr-only" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">is_active</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${formData.is_active ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                        {formData.is_active ? 'true' : 'false'}
                      </span>
                    </label>
                  </div>

                  <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/20">
                    {isSubmitting ? 'Saving to database…' : '⬆ Update Database'}
                  </button>
                </form>
              </div>
            </div>
          </div>
          )}

        </div>
      </main>
    </div>
  )

}

export default App