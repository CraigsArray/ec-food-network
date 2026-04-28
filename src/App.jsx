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
    latitude: '', longitude: '',
    image_url: '', tags: '',
    expires_at: '', is_active: true
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setFormFeedback({ type: '', message: '' })

    const tagsArray = formData.tags
      ? formData.tags.split(',').map(t => t.trim()).filter(Boolean)
      : null

    // Build post object — only schema-valid columns
    const newPost = {
      title: formData.title,
      description: formData.description || null,
      category: formData.category || null,
      address: formData.address || null,
      city: formData.city || null,
      zip: formData.zip || null,
      latitude: formData.latitude ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      image_url: formData.image_url || null,
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

    // Insert post_occurrences (start_time, end_time, notes, expires_at)
    if (insertedPost && insertedPost.length > 0) {
      const postId = insertedPost[0].id
      const validOccs = occurrences.filter(o => o.start_time).map(o => ({
        post_id: postId,
        start_time: new Date(o.start_time).toISOString(),
        end_time: o.end_time ? new Date(o.end_time).toISOString() : null,
        notes: o.notes || null
      }))

      if (validOccs.length > 0) {
        const { error: occError } = await supabase
          .from('post_occurrences')
          .insert(validOccs)
        if (occError) {
          setFormFeedback({ type: 'error', message: `Post saved, but dates failed to insert: ${occError.message}` })
          setIsSubmitting(false)
          return
        }
      }
    }

    setFormFeedback({ type: 'success', message: '✅ Resource posted successfully!' })
    setFormData({ title: '', description: '', category: '', address: '', city: '', zip: '',
      latitude: '', longitude: '', image_url: '', tags: '', expires_at: '', is_active: true })
    setOccurrences([{ start_time: '', end_time: '', notes: '' }])
    fetchPosts()
    setIsSubmitting(false)
  }

  const formatDate = (date) => {
    if (!date) return ''
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(date)
  }

  return (
    <div className={`${darkMode ? 'dark' : ''} min-h-screen font-sans selection:bg-indigo-500/30 pb-20 bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200 transition-colors duration-300`}>
      <header className="w-full bg-gradient-to-r from-indigo-100 via-purple-100 to-slate-100 dark:from-indigo-950 dark:via-purple-950 dark:to-slate-950 border-b border-indigo-300/40 dark:border-indigo-500/20 pt-16 pb-12 px-6">
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

          <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-200 dark:to-purple-200 mb-4 tracking-tight">
            East County Food Network
          </h1>
          <p className="text-lg md:text-xl text-indigo-700/80 dark:text-indigo-200/80 max-w-2xl font-medium">
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
              className="bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-3xl min-h-[350px] shadow-lg shadow-black/10 dark:shadow-black/20 overflow-hidden relative"
            >
              {!mapLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-200 dark:bg-slate-900 z-10">
                  <MapPin className="w-12 h-12 text-slate-400 dark:text-slate-600 mb-4 animate-pulse" />
                  <h3 className="text-xl font-semibold text-slate-500 dark:text-slate-400">Loading Map...</h3>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-b border-slate-300 dark:border-slate-800 pb-4">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Community Feed</h2>
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-900 px-3 py-1 rounded-full border border-slate-300 dark:border-slate-800">
                {posts.length} Posts
              </span>
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
            ) : posts.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 p-12 rounded-3xl text-center shadow-lg shadow-black/20">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 mb-4">
                  <Hash className="w-8 h-8 text-slate-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-300 mb-2">No resources found</h3>
                <p className="text-slate-500">Be the first to share a food resource in your community!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {posts.map((post) => {
                  const isActive = activePostId === post.id
                  return (
                    <article 
                      key={post.id} 
                      ref={el => postRefs.current[post.id] = el}
                      onClick={() => setActivePostId(post.id)}
                      className={`bg-white dark:bg-slate-900 border rounded-3xl overflow-hidden shadow-lg dark:shadow-xl shadow-black/10 dark:shadow-black/20 transition-all duration-300 group cursor-pointer ${
                        isActive ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {post.image_url && (
                        <div className="w-full h-64 overflow-hidden bg-slate-950">
                          <img 
                            src={post.image_url} 
                            alt={post.title} 
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                            onError={(e) => { e.target.style.display = 'none' }}
                          />
                        </div>
                      )}
                      <div className="p-7">
                        <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                          <h3 className={`text-2xl font-bold leading-tight transition-colors ${isActive ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-300'}`}>
                            {post.title}
                          </h3>
                          
                          {/* Smart Feed Badges */}
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
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4 flex items-center">
                            Pickup Details
                          </h4>
                          <div className="space-y-4">
                            {(post.status === 'upcoming' || post.status === 'now') && post.nextOccurrence ? (
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 bg-indigo-100 dark:bg-indigo-500/20 p-2 rounded-lg">
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
                                <div className="mt-0.5 bg-slate-200 dark:bg-slate-800 p-2 rounded-lg">
                                  <CalendarDays className="w-5 h-5 text-slate-400" />
                                </div>
                                <p className="font-medium text-slate-500 dark:text-slate-400 italic pt-1 text-sm">No upcoming dates scheduled</p>
                              </div>
                            )}

                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 bg-emerald-100 dark:bg-emerald-500/20 p-2 rounded-lg">
                                <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                              </div>
                              <div>
                                {post.location_name && <p className="font-semibold text-slate-800 dark:text-slate-200 text-base">{post.location_name}</p>}
                                <p className={`text-slate-600 dark:text-slate-400 mt-0.5 ${!post.location_name ? 'font-semibold text-base text-slate-800 dark:text-slate-200' : 'text-sm'}`}>
                                  {post.address || 'Address not provided'}
                                  {(post.address && post.city) && ', '}
                                  {post.city && post.city}
                                  {post.zip && ` ${post.zip}`}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {(() => {
                          const isLong = post.description && post.description.length > DESC_LIMIT
                          const isExpanded = !!expandedDescriptions[post.id]
                          return (
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
                          )
                        })()}

                        <div className="flex items-center justify-between pt-5 border-t border-slate-200 dark:border-slate-800/60 mt-4">
                          {(post.author_name || post.organization_type) ? (
                            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                              <User className="w-4 h-4 opacity-70" />
                              <span>
                                <span className="font-medium text-slate-700 dark:text-slate-300">{post.author_name || 'Anonymous'}</span>
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
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">Latitude</label>
                        <input value={formData.latitude} onChange={e => handleField('latitude', e.target.value)} placeholder="32.7946" type="number" step="any" className="field" />
                      </div>
                      <div>
                        <label className="label">Longitude</label>
                        <input value={formData.longitude} onChange={e => handleField('longitude', e.target.value)} placeholder="-116.9625" type="number" step="any" className="field" />
                      </div>
                    </div>
                  </div>

                  {/* Section: Event Occurrences */}
                  <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Event Occurrences</p>
                      <button type="button" onClick={handleAddOccurrence} className="text-xs flex items-center gap-1 text-indigo-500 hover:text-indigo-400 font-semibold">
                        <Plus className="w-3 h-3" /> Add Date
                      </button>
                    </div>
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
                  </div>

                  {/* Section: Media & Tags */}
                  <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">Media & Tags</p>
                    <div>
                      <label className="label">Image URL</label>
                      <input value={formData.image_url} onChange={e => handleField('image_url', e.target.value)} type="url" placeholder="https://..." className="field" />
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
                    {isSubmitting ? 'Inserting into Supabase…' : '⬆ Post to Supabase'}
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