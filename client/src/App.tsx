import { useState, useEffect } from "react";

interface Website {
  locked: boolean;
  unlock_timestamp?: number;
}

interface ActivityEntry {
  id: number;
  timestamp: string;
  action: string;
  details: string;
  status: 'info' | 'success' | 'error' | 'warning';
}

interface Timer {
  remaining: number;
  interval: NodeJS.Timeout;
}

function App() {
  // State management
  const [currentSection, setCurrentSection] = useState<'login' | 'dashboard' | 'activity'>('login');
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [websites, setWebsites] = useState<Record<string, Website>>({});
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [timers, setTimers] = useState<Record<string, Timer>>({});
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [currentAuthAction, setCurrentAuthAction] = useState<(() => void) | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Configuration
  const API_BASE_URL = 'https://devfuad.com/weblocker';

  // Utility functions
  const normalizeUrl = (url: string): string => {
    try {
      const normalized = url.startsWith('http') ? url : 'https://' + url;
      return new URL(normalized).hostname.replace('www.', '');
    } catch {
      return url.replace(/^https?:\/\//, '').replace('www.', '').split('/')[0];
    }
  };

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatDateTime = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  };

  const getActivityIcon = (action: string): string => {
    const iconMap: Record<string, string> = {
      'Login': 'fas fa-sign-in-alt',
      'Logout': 'fas fa-sign-out-alt',
      'Website Added': 'fas fa-plus-circle',
      'Website Removed': 'fas fa-minus-circle',
      'Website Locked': 'fas fa-lock',
      'Website Unlocked': 'fas fa-unlock',
      'PIN Validation': 'fas fa-key',
      'Admin Authentication': 'fas fa-user-shield'
    };
    return iconMap[action] || 'fas fa-info-circle';
  };

  const logActivity = (action: string, details = '', status: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toISOString();
    const activityEntry: ActivityEntry = {
      id: Date.now(),
      timestamp,
      action,
      details,
      status
    };

    setActivityLog(prev => {
      const newLog = [activityEntry, ...prev];
      if (newLog.length > 100) {
        newLog.splice(100);
      }
      localStorage.setItem('weblocker_activity', JSON.stringify(newLog));
      return newLog;
    });
  };

  const showError = (field: string, message: string) => {
    setErrors(prev => ({ ...prev, [field]: message }));
    setTimeout(() => {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }, 5000);
  };

  const setLoadingState = (field: string, isLoading: boolean) => {
    setLoading(prev => ({ ...prev, [field]: isLoading }));
  };

  // Timer management
  const startTimer = (host: string, duration = 60) => {
    // Clear existing timer
    if (timers[host]) {
      clearInterval(timers[host].interval);
    }

    let remaining = duration;
    const interval = setInterval(() => {
      remaining--;
      setTimers(prev => ({
        ...prev,
        [host]: { ...prev[host], remaining }
      }));
      
      if (remaining <= 0) {
        clearInterval(interval);
        setTimers(prev => {
          const newTimers = { ...prev };
          delete newTimers[host];
          return newTimers;
        });
        lockWebsite(host, true);
      }
    }, 60000);

    setTimers(prev => ({
      ...prev,
      [host]: { remaining, interval }
    }));
  };

  // API calls
  const makeApiCall = async (endpoint: string, data: any) => {
    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  };

  const login = async (username: string, password: string) => {
    try {
      const data = await makeApiCall('login.php', { username, password });
      
      if (data.success) {
        setCurrentUser(username);
        localStorage.setItem('weblocker_user', username);
        localStorage.setItem('weblocker_session', Date.now().toString());
        
        logActivity('Login', `User "${username}" logged in successfully`, 'success');
        setCurrentSection('dashboard');
        await loadUserData(username);
        return true;
      } else {
        logActivity('Login Failed', `Failed login attempt for user "${username}"`, 'error');
        throw new Error(data.message || 'Login failed');
      }
    } catch (error) {
      throw error;
    }
  };

  const loadUserData = async (username: string) => {
    try {
      const data = await makeApiCall('user.php', { username });
      if (data.success) {
        setWebsites(data.websites || {});
        
        // Start timers for unlocked websites
        Object.entries(data.websites || {}).forEach(([host, websiteData]) => {
          const website = websiteData as Website;
          if (!website.locked && website.unlock_timestamp) {
            const unlockTime = new Date(website.unlock_timestamp * 1000);
            const now = new Date();
            const elapsed = Math.floor((now.getTime() - unlockTime.getTime()) / 60000);
            const remaining = Math.max(0, 60 - elapsed);
            
            if (remaining > 0) {
              startTimer(host, remaining);
            }
          }
        });
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  };

  const addWebsite = async (url: string) => {
    if (!currentUser) return;

    try {
      // Check if website already exists
      const host = normalizeUrl(url);
      if (websites[host]) {
        throw new Error('This website is already in your protected list');
      }

      const data = await makeApiCall('auth.php', {
        action: 'add',
        url: url,
        username: currentUser
      });
      
      if (data.success) {
        setWebsites(data.websites || {});
        logActivity('Website Added', `Added "${host}" to protected websites list`, 'success');
        return true;
      } else {
        logActivity('Website Add Failed', `Failed to add "${url}": ${data.message}`, 'error');
        throw new Error(data.message || 'Failed to add website');
      }
    } catch (error) {
      throw error;
    }
  };

  const removeWebsite = async (host: string) => {
    if (!currentUser) return;

    try {
      const data = await makeApiCall('auth.php', {
        action: 'remove',
        host: host,
        username: currentUser
      });
      
      if (data.success) {
        setWebsites(data.websites || {});
        
        // Clear timer
        if (timers[host]) {
          clearInterval(timers[host].interval);
          setTimers(prev => {
            const newTimers = { ...prev };
            delete newTimers[host];
            return newTimers;
          });
        }
        
        logActivity('Website Removed', `Removed "${host}" from protected websites list`, 'warning');
        return true;
      } else {
        throw new Error(data.message || 'Failed to remove website');
      }
    } catch (error) {
      throw error;
    }
  };

  const lockWebsite = async (host: string, autoLock = false) => {
    if (!currentUser) return;

    try {
      const data = await makeApiCall('auth.php', {
        action: 'toggle',
        host: host,
        lock: true,
        username: currentUser
      });
      
      if (data.success) {
        setWebsites(data.websites || {});
        
        // Clear timer
        if (timers[host]) {
          clearInterval(timers[host].interval);
          setTimers(prev => {
            const newTimers = { ...prev };
            delete newTimers[host];
            return newTimers;
          });
        }
        
        logActivity('Website Locked', `"${host}" has been locked ${autoLock ? '(auto-lock)' : ''}`, 'info');
        return true;
      } else {
        throw new Error(data.message || 'Failed to lock website');
      }
    } catch (error) {
      throw error;
    }
  };

  const unlockWebsite = async (host: string) => {
    if (!currentUser) return;

    try {
      const data = await makeApiCall('auth.php', {
        action: 'toggle',
        host: host,
        lock: false,
        username: currentUser
      });
      
      if (data.success) {
        setWebsites(data.websites || {});
        
        // Start 1-hour timer
        startTimer(host, 60);
        
        logActivity('Website Unlocked', `"${host}" has been unlocked for 1 hour`, 'success');
        return true;
      } else {
        throw new Error(data.message || 'Failed to unlock website');
      }
    } catch (error) {
      throw error;
    }
  };

  const authenticateAction = async (username: string, password: string) => {
    try {
      const data = await makeApiCall('login.php', { username, password });
      
      if (data.success) {
        setShowAuthModal(false);
        logActivity('Admin Authentication', 'Admin authenticated successfully', 'success');
        
        if (currentAuthAction) {
          currentAuthAction();
          setCurrentAuthAction(null);
        }
        return true;
      } else {
        logActivity('Admin Authentication Failed', 'Failed admin authentication attempt', 'error');
        throw new Error('Invalid admin credentials');
      }
    } catch (error) {
      throw error;
    }
  };

  // Stats calculation
  const getStats = () => {
    const total = Object.keys(websites).length;
    const locked = Object.values(websites).filter(w => w.locked).length;
    const unlocked = total - locked;
    return { total, locked, unlocked };
  };

  // Initialize on load
  useEffect(() => {
    // Load activity log from localStorage
    const storedActivity = localStorage.getItem('weblocker_activity');
    if (storedActivity) {
      try {
        setActivityLog(JSON.parse(storedActivity));
      } catch (error) {
        console.error('Failed to parse stored activity log:', error);
      }
    }

    // Check for existing session
    const storedUser = localStorage.getItem('weblocker_user');
    const sessionTime = localStorage.getItem('weblocker_session');
    const now = Date.now();
    
    // Session expires after 24 hours
    if (storedUser && sessionTime && (now - parseInt(sessionTime)) < 24 * 60 * 60 * 1000) {
      setCurrentUser(storedUser);
      setCurrentSection('dashboard');
      loadUserData(storedUser);
    } else {
      // Clear expired session
      localStorage.removeItem('weblocker_user');
      localStorage.removeItem('weblocker_session');
    }
  }, []);

  // Event handlers
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;
    
    if (!username || !password) {
      showError('login', 'Please enter both username and password');
      return;
    }

    // Restrict demo account
    if (username.trim() === 'demo' && password.trim() === '6996') {
      showError('login', 'Demo account access restricted in app.');
      return;
    }
    
    setLoadingState('login', true);
    
    try {
      await login(username.trim(), password.trim());
      form.reset();
    } catch (error: any) {
      showError('login', error.message);
    } finally {
      setLoadingState('login', false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('weblocker_user');
    localStorage.removeItem('weblocker_session');
    
    if (currentUser) {
      logActivity('Logout', `User "${currentUser}" logged out`, 'info');
    }
    
    setCurrentUser(null);
    setWebsites({});
    
    // Clear all timers
    Object.values(timers).forEach(timer => clearInterval(timer.interval));
    setTimers({});
    
    setCurrentSection('login');
  };

  const handleAddWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const url = formData.get('website-url') as string;
    
    if (!url) {
      showError('addWebsite', 'Please enter a website URL');
      return;
    }
    
    setLoadingState('addWebsite', true);
    
    try {
      await addWebsite(url.trim());
      form.reset();
    } catch (error: any) {
      showError('addWebsite', error.message);
    } finally {
      setLoadingState('addWebsite', false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const username = formData.get('admin-username') as string;
    const password = formData.get('admin-password') as string;
    
    if (!username || !password) {
      showError('auth', 'Please enter both username and password');
      return;
    }
    
    setLoadingState('auth', true);
    
    try {
      await authenticateAction(username.trim(), password.trim());
      form.reset();
    } catch (error: any) {
      showError('auth', error.message);
    } finally {
      setLoadingState('auth', false);
    }
  };

  const stats = getStats();
  const recentActivity = activityLog.slice(0, 3);

  return (
    <>
      {/* Login Section */}
      {currentSection === 'login' && (
        <div className="min-h-screen weblocker-bg-gradient flex items-center justify-center p-4">
          <div className="weblocker-card-gradient rounded-2xl p-8 w-full max-w-md shadow-2xl border-2 border-gray-200 relative overflow-hidden">
            <div className="weblocker-overlay-header absolute"></div>
            
            <div className="text-center mb-8">
              <div className="weblocker-brand-gradient w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <i className="fas fa-shield-alt text-white text-2xl"></i>
              </div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">WebLocker Pro</h1>
              <p className="text-gray-600 font-medium">Secure Website Protection</p>
            </div>
            
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative">
                <i className="fas fa-user absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input 
                  type="text" 
                  name="username"
                  placeholder="Username" 
                  className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl bg-gray-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all duration-300 font-medium"
                  required
                />
              </div>
              <div className="relative">
                <i className="fas fa-lock absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input 
                  type="password" 
                  name="password"
                  placeholder="Password" 
                  className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl bg-gray-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all duration-300 font-medium"
                  required
                />
              </div>
              <button 
                type="submit" 
                className={`weblocker-btn-primary w-full py-4 text-white rounded-xl font-semibold flex items-center justify-center gap-2 ${loading.login ? 'weblocker-loading' : ''}`}
                disabled={loading.login}
              >
                <i className="fas fa-sign-in-alt"></i>
                Login
              </button>
            </form>
            
            <div className="text-center mt-6 text-sm text-gray-600">
              Developed by devFuad
            </div>
            
            {errors.login && (
              <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg border-l-4 border-red-500 font-medium weblocker-shake">
                {errors.login}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dashboard Section */}
      {currentSection === 'dashboard' && (
        <div className="min-h-screen bg-gray-50">
          {/* Header */}
          <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center py-4 header-responsive">
                <div className="flex items-center gap-4">
                  <div className="weblocker-brand-gradient w-12 h-12 rounded-full flex items-center justify-center shadow-lg">
                    <i className="fas fa-shield-alt text-white text-lg"></i>
                  </div>
                  <h1 className="text-2xl font-bold text-gray-800 text-responsive">WebLocker Pro</h1>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="hidden sm:flex items-center gap-3">
                    <div className="weblocker-brand-gradient w-10 h-10 rounded-full flex items-center justify-center">
                      <i className="fas fa-user-circle text-white"></i>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-800 capitalize">{currentUser}</div>
                      <div className="text-xs text-green-600 font-semibold uppercase tracking-wide">Active</div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setCurrentSection('activity')}
                    className="p-2 text-gray-600 hover:text-blue-600 transition-colors duration-200 relative"
                  >
                    <i className="fas fa-history text-lg"></i>
                  </button>
                  
                  <button 
                    onClick={handleLogout}
                    className="p-2 text-gray-600 hover:text-red-600 transition-colors duration-200"
                  >
                    <i className="fas fa-sign-out-alt text-lg"></i>
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 grid-responsive">
              {/* Add Website Section */}
              <div className="lg:col-span-3">
                <div className="weblocker-section-gradient rounded-xl p-6 border-2 border-gray-200 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <i className="fas fa-plus-circle text-blue-600"></i>
                    Add Website
                  </h2>
                  
                  <form onSubmit={handleAddWebsite} className="flex flex-col sm:flex-row gap-4 flex-responsive">
                    <input 
                      type="text" 
                      name="website-url"
                      placeholder="Enter website URL (e.g., example.com)" 
                      className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl bg-white focus:border-blue-500 focus:outline-none transition-all duration-300 font-medium"
                      required
                    />
                    <button 
                      type="submit"
                      className={`weblocker-btn-primary px-6 py-3 text-white rounded-xl font-semibold flex items-center justify-center gap-2 sm:w-auto btn-responsive ${loading.addWebsite ? 'weblocker-loading' : ''}`}
                      disabled={loading.addWebsite}
                    >
                      <i className="fas fa-plus"></i>
                      Add Website
                    </button>
                  </form>
                  
                  {errors.addWebsite && (
                    <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg border-l-4 border-red-500 font-medium weblocker-shake">
                      {errors.addWebsite}
                    </div>
                  )}
                </div>
              </div>

              {/* Protected Websites Section */}
              <div className="lg:col-span-2">
                <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200 h-full flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <i className="fas fa-lock text-blue-600"></i>
                      Protected Websites
                    </h2>
                    <div className="weblocker-brand-gradient text-white px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                      {stats.total}
                    </div>
                  </div>
                  
                  <div className="flex-1 space-y-3 weblocker-scrollbar-thin overflow-y-auto max-h-96">
                    {Object.keys(websites).length === 0 ? (
                      <div className="text-center py-12">
                        <i className="fas fa-shield-alt text-4xl text-gray-400 mb-4"></i>
                        <p className="text-gray-600 font-medium mb-1">No websites protected yet</p>
                        <small className="text-gray-400">Add a website above to get started</small>
                      </div>
                    ) : (
                      Object.entries(websites).map(([host, data]) => (
                        <div key={host} className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 weblocker-fade-in">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <i className="fas fa-globe text-blue-600 text-lg"></i>
                              <div>
                                <div className="font-semibold text-gray-800">{host}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${data.locked ? 'status-locked' : 'status-unlocked'}`}>
                                    <i className={`fas ${data.locked ? 'fa-lock' : 'fa-unlock'} mr-1`}></i>
                                    {data.locked ? 'Locked' : 'Unlocked'}
                                  </span>
                                  {!data.locked && data.unlock_timestamp && timers[host] && (
                                    <span className="weblocker-timer-gradient px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                                      <i className="fas fa-clock text-yellow-600"></i>
                                      <span>{formatTime(timers[host].remaining)}</span>
                                    </span>
                                  )}
                                  {!data.locked && data.unlock_timestamp && !timers[host] && (
                                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                                      <i className="fas fa-check-circle mr-1"></i>
                                      Auto-lock: {new Date(data.unlock_timestamp * 1000 + 3600000).toLocaleTimeString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            {data.locked ? (
                              <button 
                                onClick={() => {
                                  setCurrentAuthAction(() => () => unlockWebsite(host));
                                  setShowAuthModal(true);
                                }}
                                className="flex-1 weblocker-btn-secondary text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2"
                              >
                                <i className="fas fa-unlock"></i>
                                Unlock
                              </button>
                            ) : (
                              <button 
                                onClick={() => {
                                  setCurrentAuthAction(() => () => lockWebsite(host));
                                  setShowAuthModal(true);
                                }}
                                className="flex-1 weblocker-btn-danger text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2"
                              >
                                <i className="fas fa-lock"></i>
                                Lock
                              </button>
                            )}
                            <button 
                              onClick={() => {
                                setCurrentAuthAction(() => () => removeWebsite(host));
                                setShowAuthModal(true);
                              }}
                              className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2"
                            >
                              <i className="fas fa-trash"></i>
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Stats Section */}
              <div className="lg:col-span-1">
                <div className="space-y-6">
                  {/* Quick Stats */}
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <i className="fas fa-chart-bar text-blue-600"></i>
                      Statistics
                    </h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Total Protected</span>
                        <span className="font-bold text-gray-800">{stats.total}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Currently Locked</span>
                        <span className="font-bold text-red-600">{stats.locked}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Unlocked</span>
                        <span className="font-bold text-green-600">{stats.unlocked}</span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <i className="fas fa-history text-blue-600"></i>
                      Recent Activity
                    </h3>
                    <div className="space-y-3 max-h-48 overflow-y-auto weblocker-scrollbar-thin">
                      {recentActivity.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-4">No recent activity</p>
                      ) : (
                        recentActivity.map(entry => (
                          <div key={entry.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                            <i className={`${getActivityIcon(entry.action)} text-blue-600 text-sm`}></i>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800">{entry.action}</div>
                              {entry.details && <div className="text-xs text-gray-600 truncate">{entry.details}</div>}
                              <div className="text-xs text-gray-400">{formatDateTime(entry.timestamp)}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* Activity Log Section */}
      {currentSection === 'activity' && (
        <div className="min-h-screen bg-gray-50">
          <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center py-4">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setCurrentSection('dashboard')}
                    className="p-2 text-gray-600 hover:text-blue-600 transition-colors duration-200"
                  >
                    <i className="fas fa-arrow-left text-lg"></i>
                  </button>
                  <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <i className="fas fa-history text-blue-600"></i>
                    Activity Log
                  </h1>
                </div>
                
                <button 
                  onClick={() => {
                    if (confirm('Are you sure you want to clear all activity logs?')) {
                      setActivityLog([]);
                      localStorage.setItem('weblocker_activity', JSON.stringify([]));
                      logActivity('Activity Log Cleared', 'All activity history has been cleared', 'warning');
                    }
                  }}
                  className="p-2 text-gray-600 hover:text-red-600 transition-colors duration-200"
                >
                  <i className="fas fa-trash text-lg"></i>
                </button>
              </div>
            </div>
          </header>

          <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm min-h-96">
              {activityLog.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <i className="fas fa-clipboard-list text-4xl text-gray-400 mb-4"></i>
                  <p className="text-gray-600 font-medium mb-1">No activity recorded yet</p>
                  <small className="text-gray-400">Activity will appear here as you use the dashboard</small>
                </div>
              ) : (
                <div className="p-6">
                  <div className="space-y-4">
                    {activityLog.map(entry => (
                      <div key={entry.id} className={`flex items-start gap-4 p-4 border border-gray-200 rounded-lg ${
                        entry.status === 'error' ? 'bg-red-50' : 
                        entry.status === 'success' ? 'bg-green-50' : 
                        entry.status === 'warning' ? 'bg-yellow-50' : 'bg-gray-50'
                      }`}>
                        <div className="flex-shrink-0">
                          <i className={`${getActivityIcon(entry.action)} text-lg ${
                            entry.status === 'error' ? 'text-red-600' : 
                            entry.status === 'success' ? 'text-green-600' : 
                            entry.status === 'warning' ? 'text-yellow-600' : 'text-blue-600'
                          }`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <h4 className="font-semibold text-gray-800">{entry.action}</h4>
                            <span className="text-sm text-gray-400">{formatDateTime(entry.timestamp)}</span>
                          </div>
                          {entry.details && <p className="text-gray-600 text-sm mt-1">{entry.details}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      )}

      {/* Authentication Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="weblocker-card-gradient rounded-2xl p-6 w-full max-w-md shadow-2xl border-2 border-gray-200 relative overflow-hidden">
            <div className="weblocker-overlay-header absolute"></div>
            
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-gray-800 flex items-center justify-center gap-2">
                <i className="fas fa-user-shield text-blue-600"></i>
                Admin Authentication
              </h3>
              <p className="text-gray-600 text-sm mt-2">Enter admin credentials to proceed with this action</p>
            </div>
            
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="relative">
                <i className="fas fa-user absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input 
                  type="text" 
                  name="admin-username"
                  placeholder="Admin Username" 
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all duration-300 font-medium"
                  required
                />
              </div>
              <div className="relative">
                <i className="fas fa-key absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                <input 
                  type="password" 
                  name="admin-password"
                  placeholder="Admin Password" 
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all duration-300 font-medium"
                  required
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowAuthModal(false)}
                  className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 transition-all duration-300"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className={`weblocker-btn-primary flex-1 py-3 text-white rounded-xl font-semibold flex items-center justify-center gap-2 ${loading.auth ? 'weblocker-loading' : ''}`}
                  disabled={loading.auth}
                >
                  <i className="fas fa-check"></i>
                  Confirm
                </button>
              </div>
            </form>
            
            {errors.auth && (
              <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg border-l-4 border-red-500 font-medium weblocker-shake">
                {errors.auth}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default App;
