import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { Search, Download, Trash2, Loader2, MapPin, Globe, Phone, Mail, CheckCircle, AlertTriangle } from 'lucide-react';

const SOCKET_URL = 'http://localhost:5000';

function App() {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [limit, setLimit] = useState(20);
  const [results, setResults] = useState([]);
  const [isScraping, setIsScraping] = useState(false);
  const [status, setStatus] = useState('Idle');
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on('scrape-progress', (data) => {
      setResults(prev => {
        const index = prev.findIndex(item => item.name === data.name);
        if (index !== -1) {
          const newResults = [...prev];
          newResults[index] = data;
          return newResults;
        }
        return [...prev, data];
      });
      setStatus(`Processing: ${data.name}...`);
    });

    socketRef.current.on('scrape-complete', (finalData) => {
      setIsScraping(false);
      setStatus('Complete!');
    });

    socketRef.current.on('scrape-error', (msg) => {
      setIsScraping(false);
      setStatus(`Error: ${msg}`);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  const startScrape = () => {
    if (!query || !location) return;
    setResults([]);
    setIsScraping(true);
    setStatus('Initializing Playwright...');
    socketRef.current.emit('start-scrape', { query, location, limit: parseInt(limit) });
  };

  const clearResults = () => {
    setResults([]);
    setStatus('Idle');
  };

  const exportXLSX = async () => {
    try {
      const response = await axios.post(`${SOCKET_URL}/export-xlsx`, { data: results }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `scraped_data_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div className="container animate-fade-in">
      <header className="header">
        <div>
          <h1 className="title-gradient">G-Maps Scraper</h1>
          <p style={{ color: 'var(--text-muted)' }}>AI Data Generation Suite</p>
        </div>
        <div className="glass-card" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className={`status-dot ${isScraping ? 'pulse' : ''}`} style={{ width: 10, height: 10, borderRadius: '50%', background: isScraping ? '#4ade80' : '#94a3b8' }}></div>
          <span style={{ fontSize: '0.875rem' }}>{status}</span>
        </div>
      </header>

      <section className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 150px', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Keywords</label>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                style={{ width: '100%', paddingLeft: '2.5rem' }} 
                placeholder="e.g. Web Development" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Location</label>
            <div style={{ position: 'relative' }}>
              <MapPin size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                style={{ width: '100%', paddingLeft: '2.5rem' }} 
                placeholder="e.g. Casablanca" 
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Limit</label>
            <input 
              type="number" 
              style={{ width: '100%' }} 
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <button 
            className="btn-primary" 
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            onClick={startScrape}
            disabled={isScraping}
          >
            {isScraping ? <Loader2 className="spin" size={20} /> : 'Start Scrape'}
          </button>
        </div>
      </section>

      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3>Extracted Data ({results.length})</h3>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-secondary" onClick={clearResults} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Trash2 size={16} /> Clear
            </button>
            <button className="btn-primary" onClick={exportXLSX} disabled={results.length === 0} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Download size={16} /> Export XLSX
            </button>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Business Name</th>
                <th>Phone</th>
                <th>Website/Email</th>
                <th>LinkedIn</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No data yet. Start a search to see results here.
                  </td>
                </tr>
              ) : (
                results.map((res, index) => (
                  <tr key={index} className="animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
                    <td style={{ fontWeight: 600 }}>{res.name}</td>
                    <td>{res.phone}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                          <Globe size={14} className="text-primary" /> 
                          <span className="text-muted" style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.website}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                          <Mail size={14} style={{ color: 'var(--accent)' }} /> 
                          <span style={{ color: 'var(--accent)' }}>{res.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <a href={res.linkedin} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: '#0077b5', textDecoration: 'none' }}>
                          <img src="https://cdn-icons-png.flaticon.com/512/174/174857.png" width="14" alt="LI" />
                          View Profile
                        </a>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', maxWidth: '200px' }}>
                          {res.linkedin_bio}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${res.email !== 'Pending...' ? 'status-active' : 'status-pending'}`}>
                        {res.email !== 'Pending...' ? 'Complete' : 'Pending...'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .text-primary { color: var(--primary); }
        .text-muted { color: var(--text-muted); }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--glass-border);
          color: white;
          padding: 0.6rem 1.2rem;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-secondary:hover { background: rgba(255, 255, 255, 0.1); }
      `}</style>
    </div>
  );
}

export default App;
