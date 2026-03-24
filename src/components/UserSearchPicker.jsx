import React, { useState, useRef, useEffect } from 'react';
import { Search, User } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { tournamentService } from '../services/tournamentService';

export function UserSearchPicker({ onSelect, excludeIds = [] }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (value) => {
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.length < 2) {
      setResults([]);
      setShowResults(value.length > 0);
      return;
    }

    setShowResults(true);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const users = await tournamentService.searchUsers(value);
        setResults(users.filter(u => !excludeIds.includes(u.id)));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleSelect = (user) => {
    onSelect({ id: user.id, email: user.email, fullName: user.full_name || user.email });
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  return (
    <div className="user-search-picker" ref={containerRef}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          className="user-search-input"
          placeholder={t('userSearch.placeholder')}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => query.length >= 2 && setShowResults(true)}
        />
      </div>

      {showResults && (
        <div className="user-search-results">
          {loading && (
            <div className="user-search-hint">{t('common.loading')}</div>
          )}
          {!loading && query.length < 2 && (
            <div className="user-search-hint">{t('userSearch.typeToSearch')}</div>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="user-search-hint">{t('userSearch.noResults')}</div>
          )}
          {!loading && results.map(user => (
            <div
              key={user.id}
              className="user-search-item"
              onClick={() => handleSelect(user)}
            >
              <div>
                <div className="user-search-name">
                  <User size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
                  {user.full_name || user.email}
                </div>
                {user.full_name && (
                  <div className="user-search-email">{user.email}</div>
                )}
              </div>
              {user.role && user.role !== 'user' && (
                <span className="role-label">{user.role}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
