import React, { useState, useEffect } from 'react';
import { ArrowLeft, Target, RotateCcw, CheckCircle, Eye } from 'lucide-react';
import { useLiveMatch } from '../contexts/LiveMatchContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { matchService } from '../services/tournamentService';

export function MatchInterface({ match, onMatchComplete, onBack }) {
  // Show loading state if match is not loaded yet
  if (!match) {
    return (
      <div className="match-interface">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading match...</p>
        </div>
      </div>
    );
  }

  const [matchSettings, setMatchSettings] = useState({
    legsToWin: match?.legsToWin || 3,
    startingScore: match?.startingScore || 501
  });

  // Update match settings when match prop changes
  useEffect(() => {
    if (match) {
      console.log('Match data in MatchInterface:', match);
      console.log('Setting match settings - legsToWin:', match.legsToWin, 'startingScore:', match.startingScore);
      setMatchSettings({
        legsToWin: match.legsToWin || 3,
        startingScore: match.startingScore || 501
      });
    }
  }, [match]);
  // Initialize state with persisted data or defaults
  const getInitialState = () => {
    const matchId = match?.id;
    if (!matchId) return null;
    
    const savedState = localStorage.getItem(`match-state-${matchId}`);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        return parsed;
      } catch (error) {
        console.error('Error parsing saved match state:', error);
      }
    }
    
    return {
      currentLeg: 1,
      currentPlayer: null, // null means match hasn't started yet
      matchStarter: null,
      legScores: {
        player1: { legs: 0, currentScore: matchSettings.startingScore, totalScore: 0, totalDarts: 0, legDarts: 0, legAverages: [], checkouts: [], legDetails: [] },
        player2: { legs: 0, currentScore: matchSettings.startingScore, totalScore: 0, totalDarts: 0, legDarts: 0, legAverages: [], checkouts: [], legDetails: [] }
      },
      currentTurn: {
        score: 0,
        darts: 0,
        scores: [],
        dartCount: 0,
        turnStartScore: null
      },
      turnHistory: [],
      matchComplete: false,
      inputMode: 'single',
      showMatchStarter: false // Don't show match starter dialog by default
    };
  };

  const initialState = getInitialState();
  const [currentLeg, setCurrentLeg] = useState(initialState?.currentLeg || 1);
  const [currentPlayer, setCurrentPlayer] = useState(initialState?.currentPlayer !== undefined ? initialState.currentPlayer : null);
  const [matchStarter, setMatchStarter] = useState(initialState?.matchStarter || null);
  const [legScores, setLegScores] = useState(initialState?.legScores || {
    player1: { legs: 0, currentScore: matchSettings.startingScore, totalScore: 0, totalDarts: 0, legDarts: 0, legAverages: [], checkouts: [], legDetails: [] },
    player2: { legs: 0, currentScore: matchSettings.startingScore, totalScore: 0, totalDarts: 0, legDarts: 0, legAverages: [], checkouts: [], legDetails: [] }
  });
  const [currentTurn, setCurrentTurn] = useState(initialState?.currentTurn || {
    score: 0,
    darts: 0,
    scores: [],
    dartCount: 0,
    turnStartScore: null // Track score at start of turn for bust restoration
  });
  const [turnHistory, setTurnHistory] = useState(initialState?.turnHistory || []);
  const [matchComplete, setMatchComplete] = useState(initialState?.matchComplete || false);
  const [inputMode, setInputMode] = useState(initialState?.inputMode || 'single');
  const [showMatchStarter, setShowMatchStarter] = useState(initialState?.showMatchStarter || false);
  const [isRemovingDart, setIsRemovingDart] = useState(false); // Prevent rapid clicks
  const [bustingPlayer, setBustingPlayer] = useState(null); // Track which player is busting (0 or 1)

  // Only show match starter dialog if it's a new match and no match starter has been chosen
  // This effect is now mainly for cases where the state changes after initial load
  useEffect(() => {
    // Don't show if currentPlayer is already set (match has started)
    if (currentPlayer !== null && currentPlayer !== undefined) {
      setShowMatchStarter(false);
      return;
    }
    
    // Only show if we explicitly set showMatchStarter to true (from database check)
    // Don't auto-show if match is already in progress
    if (currentLeg === 1 && matchStarter === null && !matchComplete && showMatchStarter === false) {
      // Check if match has any progress (legs won, scores changed, etc.)
      const hasProgress = legScores.player1.legs > 0 || 
                         legScores.player2.legs > 0 ||
                         legScores.player1.currentScore !== matchSettings.startingScore ||
                         legScores.player2.currentScore !== matchSettings.startingScore ||
                         turnHistory.length > 0;
      
      // Only show if there's no progress
      if (!hasProgress) {
        setShowMatchStarter(true);
      }
    }
  }, [currentLeg, matchStarter, matchComplete, legScores, turnHistory, matchSettings.startingScore, showMatchStarter, currentPlayer]);
  
  const { startLiveMatch, endLiveMatch, updateLiveMatch, isMatchLiveOnThisDevice } = useLiveMatch();
  const { user } = useAuth();
  
  // Check if user is logged in - non-logged-in users can only view
  const isViewOnly = !user;

  // Function to load match state from database
  const loadMatchStateFromDatabase = async (matchId, startingScore) => {
    if (!matchId) return null;
    
    try {
      const { data, error } = await supabase
        .from('matches')
        .select('current_leg, player1_current_score, player2_current_score, player1_legs, player2_legs, current_player, started_by_user_id')
        .eq('id', matchId)
        .single();

      if (error) {
        console.error('Error loading match state from database:', error);
        return null;
      }

      if (data) {
        // Check if match is already in progress
        const isInProgress = data.current_leg > 1 || 
                             data.player1_legs > 0 || 
                             data.player2_legs > 0 ||
                             (data.player1_current_score !== null && data.player1_current_score !== startingScore) ||
                             (data.player2_current_score !== null && data.player2_current_score !== startingScore);

        return {
          currentLeg: data.current_leg || 1,
          currentPlayer: data.current_player !== null && data.current_player !== undefined ? data.current_player : 0,
          legScores: {
            player1: {
              legs: data.player1_legs || 0,
              currentScore: data.player1_current_score !== null && data.player1_current_score !== undefined ? data.player1_current_score : startingScore,
              totalScore: 0,
              totalDarts: 0,
              legDarts: 0,
              legAverages: [],
              checkouts: [],
              legDetails: []
            },
            player2: {
              legs: data.player2_legs || 0,
              currentScore: data.player2_current_score !== null && data.player2_current_score !== undefined ? data.player2_current_score : startingScore,
              totalScore: 0,
              totalDarts: 0,
              legDarts: 0,
              legAverages: [],
              checkouts: [],
              legDetails: []
            }
          },
          isInProgress,
          // If match is in progress, we can infer the match starter from the current player
          // For leg 1, the match starter is the current player
          matchStarter: isInProgress && data.current_leg === 1 ? data.current_player : null
        };
      }

      return null;
    } catch (error) {
      console.error('Error loading match state from database:', error);
      return null;
    }
  };

  // Function to update match state to database
  const updateMatchToDatabase = async (matchId, matchState) => {
    if (!matchId) return;
    
    try {
      const { error } = await supabase
        .from('matches')
        .update({
          current_leg: matchState.currentLeg,
          player1_current_score: matchState.legScores.player1.currentScore,
          player2_current_score: matchState.legScores.player2.currentScore,
          player1_legs: matchState.legScores.player1.legs,
          player2_legs: matchState.legScores.player2.legs,
          current_player: matchState.currentPlayer,
          last_activity_at: new Date().toISOString()
        })
        .eq('id', matchId);

      if (error) {
        console.error('Error updating match to database:', error);
      } else {
        console.log('✅ Database sync:', matchId);
      }
    } catch (error) {
      console.error('Error updating match to database:', error);
    }
  };

  // Load match state from database if localStorage is empty or match is in progress
  useEffect(() => {
    const loadMatchState = async () => {
      if (!match?.id) return;

      const stored = localStorage.getItem(`match-state-${match.id}`);
      let hasLocalState = false;
      
      // If localStorage has state with currentPlayer or matchStarter, use it
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Check if we have a currentPlayer set (this means match has started)
          if (parsed.currentPlayer !== null && parsed.currentPlayer !== undefined) {
            setCurrentPlayer(parsed.currentPlayer);
            if (parsed.matchStarter !== null && parsed.matchStarter !== undefined) {
              setMatchStarter(parsed.matchStarter);
            }
            setShowMatchStarter(false);
            hasLocalState = true;
          } else if (parsed.matchStarter !== null && parsed.matchStarter !== undefined) {
            // If we have matchStarter but no currentPlayer, set currentPlayer from matchStarter
            setMatchStarter(parsed.matchStarter);
            setCurrentPlayer(parsed.matchStarter);
            setShowMatchStarter(false);
            hasLocalState = true;
          }
        } catch (error) {
          console.error('Error parsing localStorage on mount:', error);
        }
      }

      // If localStorage doesn't have currentPlayer or matchStarter, check database
      if (!hasLocalState) {
        const startingScore = match?.startingScore || matchSettings.startingScore || 501;
        const dbState = await loadMatchStateFromDatabase(match.id, startingScore);
        if (dbState) {
          if (dbState.isInProgress) {
            // Match is already in progress - restore state from database
            setCurrentLeg(dbState.currentLeg);
            setCurrentPlayer(dbState.currentPlayer);
            setLegScores(dbState.legScores);
            
            // If we can determine the match starter, set it
            if (dbState.matchStarter !== null && dbState.matchStarter !== undefined) {
              setMatchStarter(dbState.matchStarter);
            }
            
            // Don't show match starter dialog for matches in progress
            setShowMatchStarter(false);
            
            // Save to localStorage
            const matchState = {
              currentLeg: dbState.currentLeg,
              currentPlayer: dbState.currentPlayer,
              matchStarter: dbState.matchStarter,
              legScores: dbState.legScores,
              currentTurn: { score: 0, darts: 0, scores: [], dartCount: 0, turnStartScore: null },
              turnHistory: [],
              matchComplete: false,
              inputMode: 'single',
              showMatchStarter: false
            };
            localStorage.setItem(`match-state-${match.id}`, JSON.stringify(matchState));
          } else {
            // Match is new - show match starter dialog
            setShowMatchStarter(true);
          }
        }
      }
    };

    loadMatchState();
  }, [match?.id]); // Only run when match ID changes

  // Ensure localStorage is updated when matchStarter changes
  useEffect(() => {
    if (match?.id && matchStarter !== null) {
      const currentState = JSON.parse(localStorage.getItem(`match-state-${match.id}`) || '{}');
      currentState.matchStarter = matchStarter;
      currentState.showMatchStarter = false;
      // Also ensure currentPlayer is set if not already
      if (currentState.currentPlayer === null || currentState.currentPlayer === undefined) {
        currentState.currentPlayer = matchStarter;
      }
      localStorage.setItem(`match-state-${match.id}`, JSON.stringify(currentState));
    }
  }, [matchStarter, match?.id]);

  // Ensure localStorage is updated immediately when currentPlayer changes
  useEffect(() => {
    if (match?.id && !matchComplete) {
      const currentState = JSON.parse(localStorage.getItem(`match-state-${match.id}`) || '{}');
      currentState.currentPlayer = currentPlayer;
      // If currentPlayer is set, match has started, so don't show match starter dialog
      if (currentPlayer !== null && currentPlayer !== undefined) {
        currentState.showMatchStarter = false;
      }
      localStorage.setItem(`match-state-${match.id}`, JSON.stringify(currentState));
    }
  }, [currentPlayer, match?.id, matchComplete]);

  // Periodic database sync - update every 30 seconds during active play
  useEffect(() => {
    if (!match?.id || matchComplete) return;

    const interval = setInterval(() => {
      updateMatchToDatabase(match.id, {
        currentLeg,
        legScores,
        currentPlayer
      });
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [match?.id, currentLeg, legScores, currentPlayer, matchComplete]);

  // Save match state to localStorage whenever it changes
  useEffect(() => {
    if (match?.id && !matchComplete) {
      const matchState = {
        currentLeg,
        currentPlayer,
        matchStarter,
        legScores,
        currentTurn,
        turnHistory,
        matchComplete,
        inputMode,
        showMatchStarter
      };
      localStorage.setItem(`match-state-${match.id}`, JSON.stringify(matchState));
    }
  }, [match?.id, currentLeg, currentPlayer, matchStarter, legScores, currentTurn, turnHistory, matchComplete, inputMode, showMatchStarter]);

  const players = [
    match.player1 || { id: 'player1', name: 'Player 1' },
    match.player2 || { id: 'player2', name: 'Player 2' }
  ];
  const currentPlayerData = currentPlayer !== null && currentPlayer !== undefined 
    ? legScores[`player${currentPlayer + 1}`] 
    : null;

  const dartNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25, 0]; // Ascending order: 1-20, 25 (bull), 0 (miss)

  // Start live match when component mounts (only if match is not completed and user is logged in)
  useEffect(() => {
    // Don't start live match if match is already completed
    if (match?.status === 'completed' || matchComplete) {
      console.log('Match is already completed, skipping live match start');
      return;
    }
    
    // Only start live match tracking if user is logged in
    if (!user) {
      console.log('User not logged in, skipping live match start');
      return;
    }
    
    const matchData = {
      player1: match.player1,
      player2: match.player2,
      currentLeg,
      legScores,
      currentPlayer,
      currentTurn
    };
    
    // Start live match in context
    startLiveMatch(match.id, matchData);
    
    // Update database with user who started the match (only if match is not completed)
    console.log('User info:', user);
    if (user?.id && match.status !== 'completed') {
      console.log('Updating match starter in database:', match.id, user.id);
      matchService.startMatch(match.id, user.id, match).catch(error => {
        console.error('Error updating match starter in database:', error);
      });
    } else if (match.status === 'completed') {
      console.log('Match is already completed, skipping startMatch call');
    } else {
      console.log('No user ID available, cannot save match starter');
    }
    
    // Cleanup: end live match when component unmounts
    return () => {
      endLiveMatch(match.id);
    };
  }, [user]);

  // Update live match data whenever match state changes (only if match is not completed and user is logged in)
  useEffect(() => {
    if (matchComplete || match?.status === 'completed' || !user) {
      return; // Don't update live match if match is completed or user is not logged in
    }
    
    if (isMatchLiveOnThisDevice(match.id)) {
      const matchData = {
        player1: match.player1,
        player2: match.player2,
        currentLeg,
        legScores,
        currentPlayer,
        currentTurn,
        matchComplete
      };
      updateLiveMatch(match.id, matchData);
    }
  }, [currentLeg, legScores, currentPlayer, currentTurn, matchComplete, user]);

  const addScore = (number) => {
    if (isViewOnly) return; // Non-logged-in users cannot score
    if (currentTurn.darts >= 3) return;
    if (currentPlayer === null || currentPlayer === undefined || !currentPlayerData) return;

    // Capture starting score on first dart of turn
    const turnStartScore = currentTurn.turnStartScore !== null 
      ? currentTurn.turnStartScore 
      : currentPlayerData.currentScore;

    let scoreValue = 0;
    let label = '';

    if (number === 0) {
      // Miss
      scoreValue = 0;
      label = '0';
    } else if (number === 25) {
      // Bullseye - single bull (25 points) or double bull (50 points)
      // Triple 25 is not valid (there's no triple bull on the board)
      if (inputMode === 'triple') {
        // Don't allow triple 25 - it's not a valid score
        return;
      }
      if (inputMode === 'double') {
        scoreValue = 50;
        label = 'D25';
      } else {
        scoreValue = 25;
        label = '25';
      }
    } else {
      // Calculate score based on input mode
      switch (inputMode) {
        case 'single':
          scoreValue = number;
          label = `S${number}`;
          break;
        case 'double':
          scoreValue = number * 2;
          label = `D${number}`;
          break;
        case 'triple':
          scoreValue = number * 3;
          label = `T${number}`;
          break;
      }
    }

    const newScore = currentTurn.score + scoreValue;
    const newDarts = currentTurn.darts + 1;
    const newDartEntry = { value: scoreValue, label, number, multiplier: inputMode === 'double' ? 2 : inputMode === 'triple' ? 3 : 1 };
    const newScores = [...currentTurn.scores, newDartEntry];
    
    console.log('=== ADD SCORE DEBUG ===');
    console.log('Adding dart:', newDartEntry);
    console.log('Current turn scores before adding:', currentTurn.scores);
    console.log('New scores after adding:', newScores);

    // Update turn immediately
    setCurrentTurn({
      score: newScore,
      darts: newDarts,
      scores: newScores,
      dartCount: currentTurn.dartCount + 1,
      turnStartScore: turnStartScore
    });

    // Calculate new score but don't update if it would be a bust
    const newCurrentScore = currentPlayerData.currentScore - scoreValue;
    
    // Check for bust BEFORE updating the score display
    if (newCurrentScore < 0 || newCurrentScore === 1) {
      // Bust - restore score to what it was at the start of the turn
      // Update turn to show the dart was thrown
      setCurrentTurn({
        score: newScore,
        darts: newDarts,
        scores: newScores,
        dartCount: currentTurn.dartCount + 1,
        turnStartScore: turnStartScore
      });
      
      // Reset input mode
      setInputMode('single');
      
      // Show red background for bust
      setBustingPlayer(currentPlayer);
      
      // Show visual feedback, restore score to start of turn, add darts to count, and switch player
      setTimeout(() => {
        setCurrentTurn(prev => ({
          ...prev,
          score: 0,
          darts: 0,
          scores: [],
          turnStartScore: null
        }));
        // Restore the score to what it was at the start of the turn
        // But add the darts that were thrown (even though they resulted in a bust)
        setLegScores(prev => ({
          ...prev,
          [`player${currentPlayer + 1}`]: {
            ...prev[`player${currentPlayer + 1}`],
            currentScore: turnStartScore,
            totalDarts: prev[`player${currentPlayer + 1}`].totalDarts + newDarts,
            legDarts: prev[`player${currentPlayer + 1}`].legDarts + newDarts
          }
        }));
        // Remove bust visual feedback
        setBustingPlayer(null);
        // Switch to next player after bust
        setCurrentPlayer(prev => prev === 0 ? 1 : 0);
      }, 1000);
      return; // Exit early to prevent auto-finish
    }

    // Update player's current score (only if not a bust)
    setLegScores(prev => ({
      ...prev,
      [`player${currentPlayer + 1}`]: {
        ...prev[`player${currentPlayer + 1}`],
        currentScore: newCurrentScore
      }
    }));

    // Reset input mode after each dart
    setInputMode('single');

    // Auto-finish turn when 3 darts are thrown OR when score reaches 0
    if (newDarts === 3 || newCurrentScore === 0) {
      console.log('Auto-finishing turn - newDarts:', newDarts, 'newCurrentScore:', newCurrentScore);
      // Pass the updated turn data and current score directly to finishTurn
      const updatedTurn = {
        score: newScore,
        darts: newDarts,
        scores: newScores,
        dartCount: currentTurn.dartCount + 1,
        currentScore: newCurrentScore // Pass the updated score
      };
      finishTurn(updatedTurn);
    }
  };

  const removeLastDart = () => {
    if (isViewOnly) return; // Non-logged-in users cannot modify scores
    // Prevent rapid clicks
    if (isRemovingDart) {
      console.log('Remove dart already in progress, ignoring click');
      return;
    }
    
    setIsRemovingDart(true);
    
    // If current turn has darts, remove from current turn
    if (currentTurn.scores.length > 0) {
      console.log('=== REMOVE LAST DART DEBUG ===');
      console.log('Current turn scores BEFORE removal:', currentTurn.scores);
      console.log('Current turn scores length:', currentTurn.scores.length);
      
      const lastDart = currentTurn.scores[currentTurn.scores.length - 1];
      const newScores = currentTurn.scores.slice(0, -1);
      const newScore = newScores.reduce((sum, dart) => sum + dart.value, 0);
      const newDarts = newScores.length;

      console.log('Last dart being removed:', lastDart);
      console.log('New scores after removal:', newScores);
      console.log('New score total:', newScore);
      console.log('Adding back dart value:', lastDart.value);

      // Use functional state updates to ensure we're working with latest state
      setCurrentTurn(prev => ({
        score: newScore,
        darts: newDarts,
        scores: newScores,
        dartCount: prev.dartCount - 1
      }));

      // Restore the score by adding back the removed dart's value
      setLegScores(prev => {
        const currentPlayerScore = prev[`player${currentPlayer + 1}`].currentScore;
        const restoredScore = currentPlayerScore + lastDart.value;
        console.log('Current player score before removal:', currentPlayerScore);
        console.log('Restored score:', restoredScore);
        
        return {
          ...prev,
          [`player${currentPlayer + 1}`]: {
            ...prev[`player${currentPlayer + 1}`],
            currentScore: restoredScore
          }
        };
      });
      
      // Reset the flag after a short delay
      setTimeout(() => setIsRemovingDart(false), 100);
      return;
    }

    // If current turn is empty, restore from history
    if (turnHistory.length > 0) {
      const lastTurn = turnHistory[turnHistory.length - 1];
      const lastDart = lastTurn.turn.scores[lastTurn.turn.scores.length - 1];
      
      console.log('Cross-turn undo - lastTurn:', lastTurn);
      console.log('Cross-turn undo - lastDart:', lastDart);
      console.log('Cross-turn undo - saved score:', lastTurn.legScores[`player${lastTurn.player + 1}`].currentScore);
      
      // Restore the previous turn's state
      setCurrentPlayer(lastTurn.player);
      setCurrentLeg(lastTurn.leg);
      
      // Restore the turn with one less dart
      const restoredScores = lastTurn.turn.scores.slice(0, -1);
      const restoredScore = restoredScores.reduce((sum, dart) => sum + dart.value, 0);
      const restoredDarts = restoredScores.length;

      setCurrentTurn({
        score: restoredScore,
        darts: restoredDarts,
        scores: restoredScores,
        dartCount: lastTurn.turn.dartCount - 1
      });

      // Restore the leg scores with the removed dart's value added back
      // Use current leg scores instead of saved ones to avoid stale data
      setLegScores(prev => {
        const currentPlayerScore = prev[`player${lastTurn.player + 1}`].currentScore;
        const restoredScore = currentPlayerScore + lastDart.value;
        
        console.log('Cross-turn undo - current score:', currentPlayerScore);
        console.log('Cross-turn undo - adding back:', lastDart.value);
        console.log('Cross-turn undo - restored score:', restoredScore);
        
        return {
          ...prev,
          [`player${lastTurn.player + 1}`]: {
            ...prev[`player${lastTurn.player + 1}`],
            currentScore: restoredScore
          }
        };
      });

      // Remove the last turn from history
      setTurnHistory(prev => prev.slice(0, -1));
      
      // Reset the flag after a short delay
      setTimeout(() => setIsRemovingDart(false), 100);
    } else {
      // No darts to remove, reset flag immediately
      setIsRemovingDart(false);
    }
  };

  const finishTurn = (turnData = currentTurn) => {
    console.log('finishTurn called with turnData:', turnData);
    console.log('finishTurn - turnData.darts:', turnData.darts);
    
    if (turnData.darts === 0) {
      console.log('finishTurn: No darts thrown, returning');
      return;
    }

    // Get the current score (use passed score or fall back to state)
    const currentScore = turnData.currentScore !== undefined ? turnData.currentScore : currentPlayerData.currentScore;
    console.log('finishTurn - currentPlayerData:', currentPlayerData);
    console.log('finishTurn - turnData.currentScore:', turnData.currentScore);
    console.log('finishTurn - currentScore (used):', currentScore);
    
    // Get the starting score for this turn (for bust restoration)
    const turnStartScore = turnData.turnStartScore !== null && turnData.turnStartScore !== undefined
      ? turnData.turnStartScore
      : currentPlayerData.currentScore + turnData.score; // Calculate from current score + turn score
    
    // Check for bust (score goes below 0 or to 1)
    if (currentScore < 0 || currentScore === 1) {
      // Reset to score at start of turn, but add darts that were thrown
      setCurrentTurn({ score: 0, darts: 0, scores: [], dartCount: turnData.dartCount, turnStartScore: null });
      setLegScores(prev => ({
        ...prev,
        [`player${currentPlayer + 1}`]: {
          ...prev[`player${currentPlayer + 1}`],
          currentScore: turnStartScore,
          totalDarts: prev[`player${currentPlayer + 1}`].totalDarts + turnData.darts,
          legDarts: prev[`player${currentPlayer + 1}`].legDarts + turnData.darts
        }
      }));
      // Switch to next player after bust
      setCurrentPlayer(prev => prev === 0 ? 1 : 0);
      return;
    }

    // Check for checkout
    if (currentScore === 0) {
      // Check if last dart was a double (proper finish)
      const lastDart = turnData.scores[turnData.scores.length - 1];
      console.log('Checkout attempt - lastDart:', lastDart);
      console.log('Checkout attempt - multiplier:', lastDart.multiplier);
      console.log('Checkout attempt - turnData:', turnData);
      
      if (lastDart.multiplier !== 2) {
        // Not finished on double - bust
        console.log('Bust: Not finished on double');
        setCurrentTurn({ score: 0, darts: 0, scores: [], dartCount: turnData.dartCount, turnStartScore: null });
        setLegScores(prev => ({
          ...prev,
          [`player${currentPlayer + 1}`]: {
            ...prev[`player${currentPlayer + 1}`],
            currentScore: turnStartScore,
            totalDarts: prev[`player${currentPlayer + 1}`].totalDarts + turnData.darts,
            legDarts: prev[`player${currentPlayer + 1}`].legDarts + turnData.darts
          }
        }));
        // Switch to next player after bust
        setCurrentPlayer(prev => prev === 0 ? 1 : 0);
        return;
      }
      
      console.log('Valid checkout: Finished on double');

      // Calculate numeric checkout value (sum of all dart scores in the turn)
      const checkout = turnData.scores.reduce((sum, dart) => sum + (dart.value || 0), 0);
      const dartsUsed = currentPlayerData.legDarts + turnData.darts;
      
      // Calculate leg average: (501 / darts) * 3
      const legAverage = (matchSettings.startingScore / dartsUsed) * 3;
      
      setLegScores(prev => {
        const winnerKey = `player${currentPlayer + 1}`;
        const opponentIndex = currentPlayer === 0 ? 1 : 0;
        const opponentKey = `player${opponentIndex + 1}`;
        const opponentLegDarts = prev[opponentKey].legDarts;
        const opponentScoreRemaining = prev[opponentKey].currentScore;
        const opponentLegAverage = opponentLegDarts > 0
          ? ((matchSettings.startingScore - opponentScoreRemaining) / opponentLegDarts) * 3
          : 0;

        const newLegs = prev[`player${currentPlayer + 1}`].legs + 1;
        const prevLegAverages = prev[`player${currentPlayer + 1}`].legAverages || [];
        const newLegAverages = [...prevLegAverages, legAverage];
        const winnerLegDetails = [
          ...(prev[winnerKey].legDetails || []),
          {
            leg: currentLeg,
            darts: dartsUsed,
            checkout,
            average: legAverage,
            isWin: true
          }
        ];
        const opponentLegDetails = [
          ...(prev[opponentKey].legDetails || []),
          {
            leg: currentLeg,
            darts: opponentLegDarts,
            checkout: null,
            average: opponentLegAverage,
            isWin: false,
            remainingScore: opponentScoreRemaining
          }
        ];
        
        console.log('Awarding leg - player:', currentPlayer + 1, 'new legs:', newLegs);
        console.log('Previous legs:', prev[`player${currentPlayer + 1}`].legs);
        console.log('Leg average:', legAverage.toFixed(2), 'Darts used:', dartsUsed);
        
        const updated = {
          ...prev,
          [winnerKey]: {
            ...prev[winnerKey],
            legs: newLegs,
            currentScore: matchSettings.startingScore,
            totalScore: prev[`player${currentPlayer + 1}`].totalScore + (matchSettings.startingScore - currentPlayerData.currentScore),
            totalDarts: prev[`player${currentPlayer + 1}`].totalDarts + dartsUsed, // Add to cumulative total
            legDarts: 0, // Reset leg darts for new leg
            legAverages: newLegAverages,
            legDetails: winnerLegDetails,
            checkouts: [...prev[`player${currentPlayer + 1}`].checkouts, { leg: currentLeg, checkout, darts: turnData.darts, totalDarts: dartsUsed }]
          },
          [opponentKey]: {
            ...prev[opponentKey],
            legDetails: opponentLegDetails
          }
        };
        
        // Update database immediately after leg completion
        setTimeout(() => {
          updateMatchToDatabase(match.id, {
            currentLeg,
            legScores: updated,
            currentPlayer
          });
        }, 100);
        
        return updated;
      });

      // Check if match is complete
      const newLegs = legScores[`player${currentPlayer + 1}`].legs + 1;
      if (newLegs >= matchSettings.legsToWin) {
        // Calculate the final leg scores for match completion
        const prevLegAverages = legScores[`player${currentPlayer + 1}`].legAverages || [];
        const newLegAverages = [...prevLegAverages, legAverage];
        
        const winnerKey = `player${currentPlayer + 1}`;
        const opponentIndex = currentPlayer === 0 ? 1 : 0;
        const opponentKey = `player${opponentIndex + 1}`;
        const opponentLegDarts = legScores[opponentKey].legDarts;
        const opponentScoreRemaining = legScores[opponentKey].currentScore;
        const opponentLegAverage = opponentLegDarts > 0
          ? ((matchSettings.startingScore - opponentScoreRemaining) / opponentLegDarts) * 3
          : 0;
        const finalWinnerLegDetails = [
          ...(legScores[winnerKey].legDetails || []),
          {
            leg: currentLeg,
            darts: dartsUsed,
            checkout,
            average: legAverage,
            isWin: true
          }
        ];
        const finalOpponentLegDetails = [
          ...(legScores[opponentKey].legDetails || []),
          {
            leg: currentLeg,
            darts: opponentLegDarts,
            checkout: null,
            average: opponentLegAverage,
            isWin: false,
            remainingScore: opponentScoreRemaining
          }
        ];
        const finalLegScores = {
          ...legScores,
          [winnerKey]: {
            ...legScores[winnerKey],
            legs: newLegs,
            currentScore: matchSettings.startingScore,
            totalScore: legScores[winnerKey].totalScore + (matchSettings.startingScore - currentPlayerData.currentScore),
            totalDarts: legScores[winnerKey].totalDarts + dartsUsed, // Add to cumulative total
            legDarts: 0, // Reset leg darts
            legAverages: newLegAverages,
            legDetails: finalWinnerLegDetails,
            checkouts: [...legScores[winnerKey].checkouts, { leg: currentLeg, checkout, darts: turnData.darts, totalDarts: dartsUsed }]
          },
          [opponentKey]: {
            ...legScores[opponentKey],
            legDetails: finalOpponentLegDetails
          }
        };
        completeMatch(finalLegScores);
        return;
      }

      // Start new leg - alternate who starts
      // Leg 1: matchStarter, Leg 2: other player, Leg 3: matchStarter, etc.
      const newLegNumber = currentLeg + 1;
      setCurrentLeg(prev => prev + 1);
      // Alternate based on leg number: odd legs = matchStarter, even legs = other player
      const newLegStarter = (newLegNumber % 2 === 1) ? matchStarter : (1 - matchStarter);
      setCurrentPlayer(newLegStarter); // Automatically set current player to leg starter
      
      // Sync to database when new leg starts
      setTimeout(() => {
        updateMatchToDatabase(match.id, {
          currentLeg: currentLeg + 1,
          legScores: legScores,
          currentPlayer: newLegStarter
        });
      }, 100);
      
      // Reset both players' current scores and leg darts for new leg
      setLegScores(prev => ({
        ...prev,
        player1: { ...prev.player1, currentScore: matchSettings.startingScore, legDarts: 0 },
        player2: { ...prev.player2, currentScore: matchSettings.startingScore, legDarts: 0 }
      }));

      // Clear turn history for new leg
      setTurnHistory([]);
    } else {
      // Update total score and dart count (current score already updated by addScore)
      setLegScores(prev => {
        const updated = {
          ...prev,
          [`player${currentPlayer + 1}`]: {
            ...prev[`player${currentPlayer + 1}`],
            totalScore: prev[`player${currentPlayer + 1}`].totalScore + turnData.score,
            totalDarts: prev[`player${currentPlayer + 1}`].totalDarts + turnData.darts,
            legDarts: prev[`player${currentPlayer + 1}`].legDarts + turnData.darts
          }
        };
        
        // Update database immediately after turn completion (visit = 3 darts)
        const nextPlayer = currentPlayer === 0 ? 1 : 0;
        setTimeout(() => {
          updateMatchToDatabase(match.id, {
            currentLeg,
            legScores: updated,
            currentPlayer: nextPlayer
          });
        }, 100);
        
        return updated;
      });

      setCurrentPlayer(prev => prev === 0 ? 1 : 0);
    }

    // Save current turn to history before resetting
    if (turnData.darts > 0) {
      setTurnHistory(prev => [...prev, {
        player: currentPlayer,
        turn: { ...turnData },
        legScores: { ...legScores },
        leg: currentLeg
      }]);
    }

    setCurrentTurn({ score: 0, darts: 0, scores: [], dartCount: turnData.dartCount, turnStartScore: null });
  };

  const completeMatch = (finalLegScores = legScores) => {
    // Store match data before it might become null
    const currentMatch = match;
    const winner = finalLegScores.player1.legs > finalLegScores.player2.legs ? 
      currentMatch.player1?.id : 
      currentMatch.player2?.id;
    
    console.log('MatchInterface.completeMatch - currentMatch:', currentMatch);
    console.log('MatchInterface.completeMatch - finalLegScores:', finalLegScores);
    console.log('MatchInterface.completeMatch - winner:', winner);

    // Clean up saved match state
    if (currentMatch?.id) {
      localStorage.removeItem(`match-state-${currentMatch.id}`);
    }
    
    // Check if we have valid player IDs
    if (!currentMatch.player1?.id || !currentMatch.player2?.id) {
      console.error('Missing player IDs - cannot complete match:', {
        player1Id: currentMatch.player1?.id,
        player2Id: currentMatch.player2?.id
      });
      return;
    }
    
    if (!winner) {
      console.error('No winner determined - cannot complete match');
      return;
    }
    
    // Set match complete immediately to stop periodic sync
    setMatchComplete(true);
    
    // End live match immediately
    endLiveMatch(currentMatch.id);
    
    // Also end live match in database
    if (currentMatch?.id) {
      matchService.endLiveMatch(currentMatch.id).catch(error => {
        console.error('Error ending live match in database:', error);
      });
    }
    
    // Calculate match average using the same formula as getAverage: (totalScore / totalDarts) * 3
    // This works for both players regardless of how many legs they won
    const player1LegAverages = finalLegScores.player1.legAverages || [];
    const player2LegAverages = finalLegScores.player2.legAverages || [];
    
    const player1MatchAverage = finalLegScores.player1.totalDarts > 0 
      ? (finalLegScores.player1.totalScore / finalLegScores.player1.totalDarts) * 3 
      : 0;
    const player2MatchAverage = finalLegScores.player2.totalDarts > 0 
      ? (finalLegScores.player2.totalScore / finalLegScores.player2.totalDarts) * 3 
      : 0;
    
    console.log('Player 1 totalScore:', finalLegScores.player1.totalScore, 'totalDarts:', finalLegScores.player1.totalDarts, 'Match average:', player1MatchAverage.toFixed(2));
    console.log('Player 2 totalScore:', finalLegScores.player2.totalScore, 'totalDarts:', finalLegScores.player2.totalDarts, 'Match average:', player2MatchAverage.toFixed(2));
    
    const matchResult = {
      matchId: currentMatch.id,
      groupId: currentMatch.groupId || currentMatch.group?.id,
      winner: winner,
      player1Id: currentMatch.player1?.id,
      player2Id: currentMatch.player2?.id,
      player1Legs: finalLegScores.player1.legs,
      player2Legs: finalLegScores.player2.legs,
      isPlayoff: currentMatch.isPlayoff || false,
      playoffRound: currentMatch.playoffRound,
      playoffMatchNumber: currentMatch.playoffMatchNumber,
      player1Stats: {
        totalScore: finalLegScores.player1.totalScore,
        totalDarts: finalLegScores.player1.totalDarts,
        average: player1MatchAverage,
        legAverages: player1LegAverages,
        checkouts: finalLegScores.player1.checkouts,
        legs: finalLegScores.player1.legDetails || []
      },
      player2Stats: {
        totalScore: finalLegScores.player2.totalScore,
        totalDarts: finalLegScores.player2.totalDarts,
        average: player2MatchAverage,
        legAverages: player2LegAverages,
        checkouts: finalLegScores.player2.checkouts,
        legs: finalLegScores.player2.legDetails || []
      }
    };

    console.log('MatchInterface: Calling onMatchComplete with:', matchResult);
    onMatchComplete(matchResult);
  };


  const selectMatchStarter = (playerIndex) => {
    if (isViewOnly) return; // Non-logged-in users cannot start matches
    setMatchStarter(playerIndex);
    setCurrentPlayer(playerIndex);
    setShowMatchStarter(false);
    setTurnHistory([]); // Clear turn history when starting a new match
    
    // Save match starter to localStorage immediately
    if (match?.id) {
      // Get current state or create new one
      let currentState;
      try {
        const stored = localStorage.getItem(`match-state-${match.id}`);
        currentState = stored ? JSON.parse(stored) : {};
      } catch (error) {
        console.error('Error parsing localStorage:', error);
        currentState = {};
      }
      
      // Update the state
      currentState.matchStarter = playerIndex;
      currentState.showMatchStarter = false;
      currentState.currentPlayer = playerIndex;
      currentState.currentLeg = 1;
      currentState.matchComplete = false;
      
      // Save to localStorage
      localStorage.setItem(`match-state-${match.id}`, JSON.stringify(currentState));
      
      // Sync to database when match starts
      setTimeout(() => {
        updateMatchToDatabase(match.id, {
          currentLeg: 1,
          legScores: {
            player1: { legs: 0, currentScore: matchSettings.startingScore, totalScore: 0, totalDarts: 0, legDarts: 0, legAverages: [], checkouts: [], legDetails: [] },
            player2: { legs: 0, currentScore: matchSettings.startingScore, totalScore: 0, totalDarts: 0, legDarts: 0, legAverages: [], checkouts: [], legDetails: [] }
          },
          currentPlayer: playerIndex
        });
      }, 100);
    }
  };

  const getAverage = (playerKey) => {
    const player = legScores[playerKey];
    return player.totalDarts > 0 ? (player.totalScore / player.totalDarts) * 3 : 0;
  };

  // Get the last turn's throws for a player
  const getLastTurnThrows = (playerIndex) => {
    // First check if it's the current player's turn - show current turn throws
    if (currentPlayer === playerIndex && currentTurn.scores.length > 0) {
      return currentTurn.scores.map(s => s.label);
    }
    
    // Otherwise, find the last completed turn for this player from history
    for (let i = turnHistory.length - 1; i >= 0; i--) {
      if (turnHistory[i].player === playerIndex && turnHistory[i].turn.scores.length > 0) {
        return turnHistory[i].turn.scores.map(s => s.label);
      }
    }
    
    return [];
  };

  if (matchComplete) {
    return (
      <div className="match-complete">
        <div className="complete-header">
          <CheckCircle size={48} className="success-icon" />
          <h2>Match Complete!</h2>
        </div>
        <div className="final-result">
          <div className="winner">
            Winner: {legScores.player1.legs > legScores.player2.legs ? (match.player1?.name || 'Player 1') : (match.player2?.name || 'Player 2')}
          </div>
          <div className="final-score">
            {legScores.player1.legs} - {legScores.player2.legs}
          </div>
        </div>
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          Back to Tournament
        </button>
      </div>
    );
  }

  if (showMatchStarter) {
    if (isViewOnly) {
      // Non-logged-in users cannot start matches - show view-only message
      return (
        <div className="leg-starter-dialog">
          <div className="dialog-content">
            <h2>View Only Mode</h2>
            <p>You must be logged in to start or score matches. You can view live matches and standings without logging in.</p>
            <button className="back-btn" onClick={onBack}>
              <ArrowLeft size={20} />
              Back to Tournament
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="leg-starter-dialog">
        <div className="dialog-content">
          <h2>Who starts this match?</h2>
          <div className="player-options">
            <button 
              className="player-option"
              onClick={() => selectMatchStarter(0)}
            >
              <div className="player-name">{match.player1?.name || 'Player 1'}</div>
              <div className="player-legs">{legScores.player1.legs} legs</div>
            </button>
            <button 
              className="player-option"
              onClick={() => selectMatchStarter(1)}
            >
              <div className="player-name">{match.player2?.name || 'Player 2'}</div>
              <div className="player-legs">{legScores.player2.legs} legs</div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const player1LastThrows = getLastTurnThrows(0);
  const player2LastThrows = getLastTurnThrows(1);

  return (
    <div className="match-interface mobile-optimized">
      <div className="match-scoreboard">
        <div className={`player-score player1 ${currentPlayer === 0 ? 'active-player' : ''} ${bustingPlayer === 0 ? 'bust' : ''}`}>
          <div className="player-header">
            <div className="player-name">{match.player1?.name || 'Player 1'}</div>
            <div className="legs-won">{legScores.player1.legs}</div>
          </div>
          <div className="current-score">{legScores.player1.currentScore}</div>
          {/* Show individual throws */}
          {player1LastThrows.length > 0 && (
            <div className="last-throws">
              {player1LastThrows.map((throwLabel, idx) => (
                <span key={idx} className="throw-label">{throwLabel}</span>
              ))}
            </div>
          )}
          {/* Show stats */}
          <div className="player-stats">
            <span>Avg: {getAverage('player1').toFixed(1)}</span>
            <span>Darts: {legScores.player1.legDarts}</span>
          </div>
        </div>

        <div className="vs-divider mobile-hidden">
          <span>Leg {currentLeg}</span>
          <span className="match-settings-text">First to {matchSettings.legsToWin} legs</span>
        </div>

        <div className={`player-score player2 ${currentPlayer === 1 ? 'active-player' : ''} ${bustingPlayer === 1 ? 'bust' : ''}`}>
          <div className="player-header">
            <div className="player-name">{match.player2?.name || 'Player 2'}</div>
            <div className="legs-won">{legScores.player2.legs}</div>
          </div>
          <div className="current-score">{legScores.player2.currentScore}</div>
          {/* Show individual throws */}
          {player2LastThrows.length > 0 && (
            <div className="last-throws">
              {player2LastThrows.map((throwLabel, idx) => (
                <span key={idx} className="throw-label">{throwLabel}</span>
              ))}
            </div>
          )}
          {/* Show stats */}
          <div className="player-stats">
            <span>Avg: {getAverage('player2').toFixed(1)}</span>
            <span>Darts: {legScores.player2.legDarts}</span>
          </div>
        </div>
      </div>


      <div className="dart-board">
        {isViewOnly ? (
          <div className="view-only-message">
            <Eye size={48} />
            <h3>View Only Mode</h3>
            <p>You must be logged in to score matches. You can view live matches and standings without logging in.</p>
          </div>
        ) : (
          <>
            {/* Number Selection, Mode Selection, and Remove Last */}
            <div className="dart-numbers">
              {dartNumbers.map((number, index) => (
                <button
                  key={index}
                  className={`dart-btn ${number === 25 ? 'bull' : inputMode === 'triple' ? 'triple' : inputMode === 'double' ? 'double' : 'single'}`}
                  onClick={() => addScore(number)}
                  disabled={currentTurn.darts >= 3 || (number === 25 && inputMode === 'triple')}
                >
                  {number === 0 ? '0' : number === 25 ? '25' : number}
                </button>
              ))}
              {/* Mode buttons in same row */}
              <button 
                className={`mode-btn-inline ${inputMode === 'double' ? 'active' : ''}`}
                onClick={() => setInputMode(inputMode === 'double' ? 'single' : 'double')}
              >
                Double
              </button>
              <button 
                className={`mode-btn-inline ${inputMode === 'triple' ? 'active' : ''}`}
                onClick={() => setInputMode(inputMode === 'triple' ? 'single' : 'triple')}
              >
                Triple
              </button>
              {/* Remove button */}
              <button 
                className="remove-last-btn dart-btn"
                onClick={removeLastDart}
                disabled={(currentTurn.scores.length === 0 && turnHistory.length === 0) || isRemovingDart}
              >
                <ArrowLeft size={20} />
              </button>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
