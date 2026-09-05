import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Menu, Pencil } from 'lucide-react';
import { TournamentProvider, useTournament } from './contexts/TournamentContext';
import { LeagueProvider, useLeague } from './contexts/LeagueContext';
import { LiveMatchProvider } from './contexts/LiveMatchContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AdminProvider, useAdmin } from './contexts/AdminContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { OfflineProvider } from './contexts/OfflineContext';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { TournamentsList } from './components/TournamentsList';
import { TournamentCreation } from './components/TournamentCreation';
import { TournamentManagement } from './components/TournamentManagement';
import { TournamentRegistration } from './components/TournamentRegistration';
import { MatchInterface } from './components/MatchInterface';
import { LeaguesList } from './components/LeaguesList';
import { LeagueDetail } from './components/LeagueDetail';
import { LeagueCreation } from './components/LeagueCreation';
import { Auth } from './components/Auth';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { AdminPanel } from './components/AdminPanel';
import { ManagerPanel } from './components/ManagerPanel';
import { LandingPage } from './components/LandingPage';
import { PlayerProfile } from './components/PlayerProfile';
import { OfflineBanner } from './components/OfflineBanner';
import { PullToRefresh } from './components/PullToRefresh';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotFound } from './components/NotFound';
import { ResetPassword } from './components/ResetPassword';
import { useLanguage } from './contexts/LanguageContext';
import { tournamentService } from './services/tournamentService';
import { POST_LOGIN_REDIRECT_KEY, isSafeRedirectPath } from './utils/postLoginRedirect';
import { getUserDisplayName } from './utils/userDisplayName';
import { DisplayNameEditor } from './components/DisplayNameEditor';
import './App.css';

// Shown when a signed-in user has no player record yet (they have never been
// approved into a tournament, so there are no stats to display).
function NoPlayerProfile({ onBrowseTournaments }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [isEditingName, setIsEditingName] = useState(false);
  const displayName = getUserDisplayName(user);
  return (
    <div className="unauthorized-container">
      <h2>{t('playerProfile.noLinkedProfile')}</h2>
      <p>{t('playerProfile.registerForTournamentToCreate')}</p>
      {/* The name is still editable here — it is what the manager sees when
          adding this account to a league or tournament. */}
      <div className="no-profile-name">
        {isEditingName ? (
          <DisplayNameEditor
            currentName={displayName}
            onSaved={() => setIsEditingName(false)}
            onCancel={() => setIsEditingName(false)}
          />
        ) : (
          <p>
            <span className="no-profile-name-label">{t('playerProfile.yourName')}:</span>{' '}
            <strong>{displayName || user?.email}</strong>
            <button type="button" className="profile-edit-name-btn" onClick={() => setIsEditingName(true)} title={t('playerProfile.editName')} aria-label={t('playerProfile.editName')}>
              <Pencil size={14} />
            </button>
          </p>
        )}
      </div>
      <button className="primary-btn" onClick={onBrowseTournaments}>
        {t('navigation.tournaments')}
      </button>
    </div>
  );
}

// Hoisted to module scope on purpose: components defined inside AppContent get
// a new identity on every render, so React remounts the whole page subtree on
// each context update — losing input focus and local UI state (e.g. while a
// manager is typing player names on the registration page).
function TournamentRoute() {
  const { t } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    tournaments,
    currentTournament,
    getTournament,
    refreshCurrentTournament,
    startMatch,
    deleteTournament
  } = useTournament();

  // Already-loaded tournament being opened again (back from the list, from a
  // match, from a league): re-fetch it silently so results other devices saved
  // meanwhile show up without anyone reloading the page.
  useEffect(() => {
    if (id) refreshCurrentTournament(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    // Hydrate the full tournament (groups + matches) when:
    //  - it isn't the current tournament yet, OR
    //  - the current object is only a lightweight list stub (_summary).
    const needsHydrate =
      !currentTournament ||
      currentTournament.id !== id ||
      currentTournament._summary === true;

    if (id && needsHydrate) {
      // The list now holds lightweight summaries with empty groups/matches,
      // so we must always fetch the full tournament from the DB on open
      // (getTournament dispatches SELECT_TOURNAMENT with the complete data).
      // Only fetch ids present in the loaded list — the list is public-read and
      // complete, so a missing id means deleted (the effect below redirects).
      const existsInList = tournaments.find(t => t.id === id);
      if (existsInList) {
        getTournament(id).catch(error => {
          console.error('Error loading tournament:', error);
          // If loading fails (tournament not found), redirect to tournaments list
          navigate('/tournaments');
        });
      }
      // If tournaments.length === 0, we're still loading, so wait
    }
  }, [id, tournaments, currentTournament, getTournament, navigate]);

  // If currentTournament is null and we have tournaments loaded,
  // it means the tournament was deleted, so redirect
  useEffect(() => {
    if (id && tournaments.length > 0 && !currentTournament) {
      const tournamentExists = tournaments.find(t => t.id === id);
      if (!tournamentExists) {
        navigate('/tournaments');
      }
    }
  }, [id, tournaments, currentTournament, navigate]);

  const handleMatchStart = (match) => {
    startMatch(match);
    navigate(`/match/${match.id}`);
  };

  // Confirmation and error alerts live at the call sites (they have the
  // tournament name for a localized message).
  const handleDeleteTournament = async (tournamentId) => {
    try {
      await deleteTournament(tournamentId);
    } catch (error) {
      console.error('Error deleting tournament:', error);
      throw error;
    }
  };

  // Show loading state if tournament is not loaded yet, or if we only have
  // the lightweight list stub (full groups/matches still being hydrated).
  if (!currentTournament || currentTournament.id !== id || currentTournament._summary === true) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>{t('common.loadingTournament')}</p>
      </div>
    );
  }

  // Show registration component if tournament is open for registration
  if (currentTournament.status === 'open_for_registration') {
    return (
      <PullToRefresh onRefresh={refreshCurrentTournament}>
        <TournamentRegistration
          tournament={currentTournament}
          onBack={() => navigate('/tournaments')}
          onDeleteTournament={handleDeleteTournament}
        />
      </PullToRefresh>
    );
  }

  // Show management component if tournament is started
  return (
    <PullToRefresh onRefresh={refreshCurrentTournament}>
      <TournamentManagement
        tournament={currentTournament}
        onMatchStart={handleMatchStart}
        onBack={() => navigate('/tournaments')}
        onDeleteTournament={handleDeleteTournament}
      />
    </PullToRefresh>
  );
}

// Same reason as TournamentRoute above: these must live at module scope so
// that context updates (e.g. adding a league member re-fetches the league)
// don't remount the page and wipe its local UI state such as the active tab.
function LeagueDetailRoute({ onBack, onCreateTournament, onSelectTournament }) {
  const { id } = useParams();
  const { selectLeague } = useLeague();
  return (
    <PullToRefresh onRefresh={() => selectLeague(id).catch(() => {})}>
      <LeagueDetail
        leagueId={id}
        onBack={onBack}
        onCreateTournament={onCreateTournament}
        onSelectTournament={onSelectTournament}
      />
    </PullToRefresh>
  );
}

function MatchRoute({ onMatchComplete }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tournaments, currentTournament, currentMatch, startMatch } = useTournament();

  useEffect(() => {
    if (id && (!currentMatch || currentMatch.id !== id)) {
      // Wait for the full tournament to hydrate -- a lightweight list stub
      // has empty groups, so searching it would falsely "not find" the match
      // and redirect away. The loader / TournamentRoute will replace the stub.
      if (currentTournament && currentTournament._summary === true) {
        return;
      }
      // Find match in current tournament
      if (currentTournament) {
        // Search in group matches
        let match = currentTournament.groups
          .flatMap(group => group.matches)
          .find(m => m.id === id);

        // Also search playoff matches
        if (!match && currentTournament.playoffs?.rounds) {
          for (const round of currentTournament.playoffs.rounds) {
            match = (round.matches || []).find(m => m.id === id);
            if (match) break;
          }
        }

        if (match) {
          startMatch(match);
        } else {
          // Match not found, redirect to tournament
          navigate(`/tournament/${currentTournament.id}`);
        }
      } else if (tournaments.length > 0) {
        // Tournaments have loaded but currentTournament is null and wasn't restored
        // from sessionStorage – this means the user navigated here without a valid
        // tournament context. Redirect to tournaments list.
        navigate('/tournaments');
      }
      // If tournaments.length === 0, we're still loading – don't redirect yet,
      // the LOAD_TOURNAMENTS action will restore currentTournament from sessionStorage.
    }
  }, [id, currentTournament, currentMatch, startMatch, navigate, tournaments.length]);

  return (
    <MatchInterface
      match={currentMatch}
      onMatchComplete={onMatchComplete}
      onBack={() => navigate(`/tournament/${currentTournament?.id}`)}
    />
  );
}

function PlayerProfileRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <PlayerProfile
      playerId={id}
      onBack={() => navigate(-1)}
      onSelectTournament={(tourn) => navigate(`/tournament/${tourn.id}`)}
      onSelectLeague={(league) => navigate(`/league/${league.id}`)}
      onSelectPlayer={(player) => navigate(`/player/${player.id}`)}
    />
  );
}

// My profile redirect - looks up the player linked to current user
function MyProfileRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const findMyPlayer = async () => {
      const player = await tournamentService.getPlayerByUserId(user.id);
      if (cancelled) return;
      if (player) {
        navigate(`/player/${player.id}`, { replace: true });
      } else {
        setProfileLoading(false);
      }
    };
    if (user) findMyPlayer();
    else setProfileLoading(false);
    return () => { cancelled = true; };
  }, [user, navigate]);

  if (profileLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }
  return <NoPlayerProfile onBrowseTournaments={() => navigate('/tournaments')} />;
}

function AppContent() {
  const { t } = useLanguage();
  const { user, loading } = useAuth();
  const { isAdmin, isManager, canCreateTournaments } = useAdmin();
  const {
    tournaments,
    currentTournament,
    createTournament,
    selectTournament,
    completeMatch,
    reloadTournaments,
    deleteTournament
  } = useTournament();
  const {
    reloadLeagues,
    createLeague,
    selectLeague
  } = useLeague();
  
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  const navigate = useNavigate();
  const location = useLocation();

  // After a full-page OAuth round trip (Google) the app boots at the origin,
  // so restore the page the player was on before logging in — e.g. a shared
  // tournament registration link.
  useEffect(() => {
    if (!user) return;
    const dest = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    if (dest) {
      sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
      if (isSafeRedirectPath(dest)) navigate(dest);
    }
  }, [user, navigate]);

  // Clear current tournament when navigating away from tournament routes
  useEffect(() => {
    const isTournamentRoute = location.pathname.startsWith('/tournament/');
    const isMatchRoute = location.pathname.startsWith('/match/');
    
    if (!isTournamentRoute && !isMatchRoute && currentTournament) {
      // Clear tournament when navigating to non-tournament routes
      selectTournament(null);
    }
  }, [location.pathname, currentTournament, selectTournament]);

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  // Allow public access - users can view everything without login
  // Only show Auth page if user explicitly navigates to /login
  // Removed: if (!user) { return <Auth />; }

  const handleCreateTournament = () => {
    navigate('/create-tournament');
  };

  const handleTournamentCreated = async (tournamentData) => {
    try {
      await createTournament(tournamentData);
      navigate(`/tournament/${tournamentData.id}`);
    } catch (error) {
      console.error('Error creating tournament:', error);
      // Still proceed to management view even if Supabase fails
      navigate(`/tournament/${tournamentData.id}`);
    }
  };

  const handleSelectTournament = (tournament) => {
    // Don't push the lightweight list stub into currentTournament -- it has
    // empty groups/matches. Just navigate; TournamentRoute hydrates the full
    // tournament via getTournament(id).
    navigate(`/tournament/${tournament.id}`);
  };

  const handleMatchComplete = async (matchResult) => {
    try {
      await completeMatch(matchResult);
      if (currentTournament) {
        navigate(`/tournament/${currentTournament.id}`);
      } else {
        navigate('/tournaments');
      }
    } catch (error) {
      console.error('Error completing match:', error);
      // Still navigate back even if there's an error
      if (currentTournament) {
        navigate(`/tournament/${currentTournament.id}`);
      } else {
        navigate('/tournaments');
      }
    }
  };

  // Confirmation and error alerts live at the call sites (they have the
  // tournament name for a localized message) — confirming here too produced
  // stacked double dialogs.
  const handleDeleteTournament = async (tournamentId) => {
    try {
      await deleteTournament(tournamentId);
    } catch (error) {
      console.error('Error deleting tournament:', error);
      throw error;
    }
  };

  const handleCreateLeague = () => {
    navigate('/create-league');
  };

  const handleLeagueCreated = async (leagueData) => {
    try {
      await createLeague(leagueData);
      navigate(`/league/${leagueData.id}`);
    } catch (error) {
      console.error('Error creating league:', error);
      alert(t('leagues.failedToCreateLeague'));
    }
  };

  const handleSelectLeague = (league) => {
    selectLeague(league.id);
    navigate(`/league/${league.id}`);
  };

  const handleCreateTournamentFromLeague = (league) => {
    // Navigate to tournament creation with league context
    navigate(`/create-tournament?leagueId=${league.id}`);
  };


  return (
    <div className="app">
      <OfflineBanner />

      {/* Mobile Header - only show on mobile */}
      {isMobile && (
        <div className="mobile-header">
          <button 
            className="hamburger-btn"
            onClick={() => setIsMobileNavOpen(true)}
          >
            <Menu size={24} />
          </button>
          <div className="app-title">DartLead</div>
        </div>
      )}

      {/* Mobile Navigation Backdrop - only show on mobile */}
      {isMobile && isMobileNavOpen && (
        <div 
          className="mobile-overlay-backdrop open"
          onClick={() => setIsMobileNavOpen(false)}
        />
      )}

      {/* Navigation */}
      <Navigation
        currentView={location.pathname}
        onViewChange={(view) => {
          // Logging in from the nav returns the user to the page they were on
          // (except the landing page — the dashboard is the better default).
          if (view === '/login' && location.pathname !== '/' && location.pathname !== '/login') {
            navigate(view, { state: { from: location.pathname + location.search } });
          } else {
            navigate(view);
          }
        }}
        tournament={currentTournament}
        isMobileOpen={isMobileNavOpen}
        onMobileClose={() => setIsMobileNavOpen(false)}
      />
      
      <main className="app-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={
            <PullToRefresh onRefresh={() => Promise.all([reloadTournaments(), reloadLeagues()])}>
              <Dashboard
                onCreateTournament={handleCreateTournament}
                onSelectTournament={handleSelectTournament}
                onCreateLeague={handleCreateLeague}
                onSelectLeague={handleSelectLeague}
                onNavigate={(path) => navigate(path)}
              />
            </PullToRefresh>
          } />
          <Route path="/tournaments" element={
            <PullToRefresh onRefresh={reloadTournaments}>
              <TournamentsList 
                tournaments={tournaments}
                onCreateTournament={handleCreateTournament}
                onSelectTournament={handleSelectTournament}
                onDeleteTournament={handleDeleteTournament}
              />
            </PullToRefresh>
          } />
          <Route path="/login" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/create-tournament" element={
            user && canCreateTournaments ? (
              <TournamentCreation 
                onTournamentCreated={handleTournamentCreated}
                onBack={() => navigate('/dashboard')}
              />
            ) : user ? (
              <div className="unauthorized-container">
                <h2>{t('auth.accessRestricted')}</h2>
                <p>{t('auth.onlyManagersCreateTournaments')}</p>
                <p>{t('auth.contactAdminForManager')}</p>
              </div>
            ) : (
              <Auth />
            )
          } />
          <Route path="/admin" element={
            isAdmin ? (
              <AdminPanel />
            ) : (
              <div className="unauthorized-container">
                <h2>{t('auth.accessDenied')}</h2>
                <p>{t('auth.adminOnlyPage')}</p>
              </div>
            )
          } />
          <Route path="/manager" element={
            isAdmin || isManager ? (
              <ManagerPanel />
            ) : (
              <div className="unauthorized-container">
                <h2>{t('auth.accessDenied')}</h2>
                <p>{t('auth.managerOnlyPage')}</p>
              </div>
            )
          } />
          <Route path="/tournament/:id" element={<TournamentRoute />} />
          <Route path="/match/:id" element={<MatchRoute onMatchComplete={handleMatchComplete} />} />
          {/* Profiles are public, like tournaments and leagues */}
          <Route path="/player/:id" element={<PlayerProfileRoute />} />
          <Route path="/my-profile" element={
            user ? <MyProfileRedirect /> : <Auth />
          } />
          <Route path="/leagues" element={
            <PullToRefresh onRefresh={reloadLeagues}>
              <LeaguesList 
                onCreateLeague={handleCreateLeague}
                onSelectLeague={handleSelectLeague}
              />
            </PullToRefresh>
          } />
          <Route path="/create-league" element={
            user && canCreateTournaments ? (
              <LeagueCreation 
                onLeagueCreated={handleLeagueCreated}
                onBack={() => navigate('/leagues')}
              />
            ) : user ? (
              <div className="unauthorized-container">
                <h2>{t('auth.accessRestricted')}</h2>
                <p>{t('auth.onlyManagersCreateLeagues')}</p>
              </div>
            ) : (
              <Auth />
            )
          } />
          <Route path="/league/:id" element={
            <LeagueDetailRoute
              onBack={() => navigate('/leagues')}
              onCreateTournament={handleCreateTournamentFromLeague}
              onSelectTournament={handleSelectTournament}
            />
          } />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <ThemeProvider>
        <LanguageProvider>
          <OfflineProvider>
          <AuthProvider>
            <AdminProvider>
              <LeagueProvider>
                <TournamentProvider>
                  <LiveMatchProvider>
                    <ErrorBoundary>
                      <AppContent />
                    </ErrorBoundary>
                  </LiveMatchProvider>
                </TournamentProvider>
              </LeagueProvider>
            </AdminProvider>
          </AuthProvider>
          </OfflineProvider>
        </LanguageProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
