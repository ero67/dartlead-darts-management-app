import React, { useState, useRef, useEffect } from 'react';
import { Search, User } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { tournamentService } from '../services/tournamentService';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export function UserSearchPicker({ onSelect, excludeIds = [] }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const latestQueryRef = useRef(''); // drop responses for anything but the newest query

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
    latestQueryRef.current = value;
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const users = await tournamentService.searchUsers(value);
        if (latestQueryRef.current !== value) return; // a newer search is in flight
        setResults(users.filter(u => !excludeIds.includes(u.id)));
      } catch {
        if (latestQueryRef.current === value) setResults([]);
      } finally {
        if (latestQueryRef.current === value) setLoading(false);
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
    <div className="relative text-foreground" ref={containerRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          className="pl-9"
          placeholder={t('userSearch.placeholder')}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => query.length >= 2 && setShowResults(true)}
        />
      </div>

      {showResults && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {loading && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">{t('common.loading')}</div>
          )}
          {!loading && query.length < 2 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">{t('userSearch.typeToSearch')}</div>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">{t('userSearch.noResults')}</div>
          )}
          {!loading && results.map(user => (
            <div
              key={user.id}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => handleSelect(user)}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate">
                  <User className="size-3.5 shrink-0 text-muted-foreground" />
                  {user.full_name || user.email}
                </div>
                {user.full_name && (
                  <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                )}
              </div>
              {user.role && user.role !== 'user' && (
                <Badge variant="secondary">
                  {user.role === 'admin' ? t('common.roleAdmin') : user.role === 'manager' ? t('common.roleManager') : user.role}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
