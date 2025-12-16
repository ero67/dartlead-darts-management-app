import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { TournamentProvider, useTournament } from './contexts/TournamentContext';
import { LiveMatchProvider } from './contexts/LiveMatchContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AdminProvider, useAdmin } from './contexts/AdminContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { TournamentsList } from './components/TournamentsList';
import { TournamentCreation } from './components/TournamentCreation';
import { TournamentManagement } from './components/TournamentManagement';
import { TournamentRegistration } from './components/TournamentRegistration';
import { MatchInterface } from './components/MatchInterface';
import { Auth } from './components/Auth';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { AdminPanel } from './components/AdminPanel';
import { LandingPage } from './components/LandingPage';
import './App.css';

function AppContent() {
  const { user, loading } = useAuth();
  const { isAdmin, canCreateTournaments } = useAdmin();
  const {
    tournaments,
    currentTournament,
    currentMatch,
    createTournament,
    selectTournament,
    getTournament,
    startMatch,
    completeMatch,
    deleteTournament
  } = useTournament();
  
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  const navigate = useNavigate();
  const location = useLocation();

  // Clear current tournament when navigating away from tournament routes
  useEffect(() => {
    const isTournamentRoute = location.pathname.startsWith('/tournament/');
    const isMatchRoute = location.pathname.startsWith('/match/');
    
    if (!isTournamentRoute && !isMatchRoute && currentTournament) {
      // Clear tournament when navigating to non-tournament routes
      selectTournament(null);
    }
  }, [location.pathname, currentTournament, selectTournament]);

  // Component to handle tournament loading
  const TournamentRoute = () => {
    const { id } = useParams();
    
    useEffect(() => {
      if (id && (!currentTournament || currentTournament.id !== id)) {
        // First try to find tournament in the list
        const tournament = tournaments.find(t => t.id === id);
        if (tournament) {
          selectTournament(tournament);
        } else if (tournaments.length > 0) {
          // Tournament not found in the list, try to load it directly from database
          getTournament(id).catch(error => {
            console.error('Error loading tournament:', error);
            // If loading fails (tournament not found), redirect to tournaments list
            navigate('/tournaments');
          });
        }
        // If tournaments.length === 0, we're still loading, so wait
      }
    }, [id, tournaments, currentTournament, selectTournament, getTournament, navigate]);

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

    // Show loading state if tournament is not loaded yet
    if (!currentTournament || currentTournament.id !== id) {
      return (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading tournament...</p>
        </div>
      );
    }

    // Show registration component if tournament is open for registration
    if (currentTournament.status === 'open_for_registration') {
      return (
        <TournamentRegistration 
          tournament={currentTournament} 
          onBack={() => navigate('/tournaments')}
        />
      );
    }

    // Show management component if tournament is started
    return (
      <TournamentManagement 
        tournament={currentTournament} 
        onMatchStart={handleMatchStart}
        onBack={() => navigate('/tournaments')}
        onDeleteTournament={handleDeleteTournament}
      />
    );
  };

  // Component to handle match loading
  const MatchRoute = () => {
    const { id } = useParams();
    
    useEffect(() => {
      if (id && (!currentMatch || currentMatch.id !== id)) {
        // Find match in current tournament
        if (currentTournament) {
          const match = currentTournament.groups
            .flatMap(group => group.matches)
            .find(m => m.id === id);
          if (match) {
            startMatch(match);
          } else {
            // Match not found, redirect to tournament
            navigate(`/tournament/${currentTournament.id}`);
          }
        } else {
          // No tournament loaded, redirect to tournaments list
          navigate('/tournaments');
        }
      }
    }, [id, currentTournament, currentMatch, startMatch, navigate]);

    return (
      <MatchInterface 
        match={currentMatch} 
        onMatchComplete={handleMatchComplete}
        onBack={() => navigate(`/tournament/${currentTournament?.id}`)}
      />
    );
  };

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
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
    selectTournament(tournament);
    navigate(`/tournament/${tournament.id}`);
  };

  const handleMatchStart = (match) => {
    startMatch(match);
    navigate(`/match/${match.id}`);
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

  const handleDeleteTournament = async (tournamentId) => {
    if (window.confirm('Are you sure you want to delete this tournament? This action cannot be undone.')) {
      try {
        await deleteTournament(tournamentId);
      } catch (error) {
        console.error('Error deleting tournament:', error);
        alert('Failed to delete tournament. Please check the console for details. Make sure the "deleted" column exists in the database.');
      }
    }
  };


  return (
    <div className="app">
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
        onViewChange={(view) => navigate(view)}
        tournament={currentTournament}
        isMobileOpen={isMobileNavOpen}
        onMobileClose={() => setIsMobileNavOpen(false)}
      />
      
      <main className="app-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={
            <Dashboard 
              tournaments={tournaments}
              onCreateTournament={handleCreateTournament}
              onSelectTournament={handleSelectTournament}
            />
          } />
          <Route path="/tournaments" element={
            <TournamentsList 
              tournaments={tournaments}
              onCreateTournament={handleCreateTournament}
              onSelectTournament={handleSelectTournament}
              onDeleteTournament={handleDeleteTournament}
            />
          } />
          <Route path="/login" element={<Auth />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/create-tournament" element={
            user && canCreateTournaments ? (
              <TournamentCreation 
                onTournamentCreated={handleTournamentCreated}
                onBack={() => navigate('/dashboard')}
              />
            ) : user ? (
              <div className="unauthorized-container">
                <h2>Access Restricted</h2>
                <p>Only managers and administrators can create tournaments.</p>
                <p>Please contact an administrator to request manager permissions.</p>
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
                <h2>Access Denied</h2>
                <p>You must be an administrator to access this page.</p>
              </div>
            )
          } />
          <Route path="/tournament/:id" element={<TournamentRoute />} />
          <Route path="/match/:id" element={<MatchRoute />} />
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
          <AuthProvider>
            <AdminProvider>
              <TournamentProvider>
                <LiveMatchProvider>
                  <AppContent />
                </LiveMatchProvider>
              </TournamentProvider>
            </AdminProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;