import React, { useState, useMemo } from 'react';
import { Upload, ArrowLeft, ArrowRight, Check, Loader, AlertCircle, Users, Trophy, Plus, X, Shuffle, ArrowUpDown } from 'lucide-react';
import { tournamentService, matchService } from '../services/tournamentService';
import { leagueService } from '../services/leagueService';
import { supabase, generateId } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useLeague } from '../contexts/LeagueContext';

const STEPS = ['importStepSettings', 'importStepPlayers', 'importStepGroups', 'importStepResults', 'importStepPlayoffs', 'importStepReview'];

function getMatchKey(name1, name2) {
  return [name1, name2].sort().join('::');
}

function getRoundName(t, numMatches) {
  switch (numMatches) {
    case 1: return t('manager.importFinal');
    case 2: return t('manager.importSemifinals');
    case 4: return t('manager.importQuarterfinals');
    default: return t('manager.importRound', { number: numMatches * 2 });
  }
}

export function TournamentImport() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { leagues } = useLeague();

  const [currentStep, setCurrentStep] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(false);

  // Step 0: Settings
  const [tournamentName, setTournamentName] = useState('');
  const [selectedLeagueId, setSelectedLeagueId] = useState('');
  const [legsToWin, setLegsToWin] = useState(3);
  const [startingScore, setStartingScore] = useState(501);

  // Step 1: Players
  const [playerNames, setPlayerNames] = useState([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [playerError, setPlayerError] = useState('');

  // Step 2: Groups
  const [numberOfGroups, setNumberOfGroups] = useState(2);
  const [groups, setGroups] = useState([]);

  // Step 3: Match results
  const [matchResults, setMatchResults] = useState({});

  // Step 4: Playoffs
  const [playoffsEnabled, setPlayoffsEnabled] = useState(true);
  const [qualifiedPlayers, setQualifiedPlayers] = useState([]);
  const [playoffRounds, setPlayoffRounds] = useState([]);
  const [playoffResults, setPlayoffResults] = useState({});
  const [thirdPlaceMatch, setThirdPlaceMatch] = useState(true);

  // Generate group matches for display
  const groupMatches = useMemo(() => {
    const matches = {};
    groups.forEach((group, gi) => {
      const groupKey = `group_${gi}`;
      matches[groupKey] = [];
      for (let a = 0; a < group.players.length; a++) {
        for (let b = a + 1; b < group.players.length; b++) {
          matches[groupKey].push({
            player1: group.players[a],
            player2: group.players[b],
            key: getMatchKey(group.players[a], group.players[b])
          });
        }
      }
    });
    return matches;
  }, [groups]);

  // Compute group standings from entered results
  const groupStandings = useMemo(() => {
    return groups.map((group, gi) => {
      const standings = group.players.map(name => ({
        name,
        matchesWon: 0,
        legsWon: 0,
        legsLost: 0,
        points: 0
      }));

      const groupKey = `group_${gi}`;
      const matches = groupMatches[groupKey] || [];
      matches.forEach(match => {
        const result = matchResults[match.key];
        if (!result || !result.winner) return;
        const p1Stat = standings.find(s => s.name === match.player1);
        const p2Stat = standings.find(s => s.name === match.player2);
        if (!p1Stat || !p2Stat) return;

        if (result.winner === match.player1) {
          p1Stat.matchesWon++;
          p1Stat.points += 3;
          p1Stat.legsWon += result.player1Legs;
          p1Stat.legsLost += result.player2Legs;
          p2Stat.legsWon += result.player2Legs;
          p2Stat.legsLost += result.player1Legs;
        } else {
          p2Stat.matchesWon++;
          p2Stat.points += 3;
          p2Stat.legsWon += result.player2Legs;
          p2Stat.legsLost += result.player1Legs;
          p1Stat.legsWon += result.player1Legs;
          p1Stat.legsLost += result.player2Legs;
        }
      });

      standings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return (b.legsWon - b.legsLost) - (a.legsWon - a.legsLost);
      });
      return standings;
    });
  }, [groups, groupMatches, matchResults]);

  const totalGroupMatches = useMemo(() => {
    return Object.values(groupMatches).reduce((sum, g) => sum + g.length, 0);
  }, [groupMatches]);

  const totalPlayoffMatches = useMemo(() => {
    return playoffRounds.reduce((sum, round) => sum + round.matches.length, 0);
  }, [playoffRounds]);

  // --- Step handlers ---

  const addPlayer = () => {
    const name = newPlayerName.trim();
    if (!name) return;
    if (playerNames.some(p => p.toLowerCase() === name.toLowerCase())) {
      setPlayerError(t('manager.importDuplicatePlayer'));
      return;
    }
    setPlayerNames([...playerNames, name]);
    setNewPlayerName('');
    setPlayerError('');
  };

  const removePlayer = (index) => {
    setPlayerNames(playerNames.filter((_, i) => i !== index));
  };

  const autoDistributeGroups = () => {
    const numGroups = Math.min(numberOfGroups, Math.floor(playerNames.length / 2));
    const newGroups = Array.from({ length: numGroups }, (_, i) => ({
      name: `Group ${String.fromCharCode(65 + i)}`,
      players: []
    }));
    playerNames.forEach((name, i) => {
      newGroups[i % numGroups].players.push(name);
    });
    setGroups(newGroups);
  };

  const movePlayerToGroup = (playerName, fromGroupIndex, toGroupIndex) => {
    const newGroups = groups.map((g, i) => {
      if (i === fromGroupIndex) {
        return { ...g, players: g.players.filter(p => p !== playerName) };
      }
      if (i === toGroupIndex) {
        return { ...g, players: [...g.players, playerName] };
      }
      return g;
    });
    setGroups(newGroups);
  };

  const initializeGroups = () => {
    const numGroups = Math.min(numberOfGroups, Math.floor(playerNames.length / 2));
    const newGroups = Array.from({ length: numGroups }, (_, i) => ({
      name: `Group ${String.fromCharCode(65 + i)}`,
      players: []
    }));
    setGroups(newGroups);
    setNumberOfGroups(numGroups);
  };

  const setMatchResult = (matchKey, field, value) => {
    setMatchResults(prev => ({
      ...prev,
      [matchKey]: { ...prev[matchKey], [field]: value }
    }));
  };

  // Playoff initialization
  const initializePlayoffs = () => {
    if (qualifiedPlayers.length < 2) return;

    const numPlayers = qualifiedPlayers.length;
    let bracketSize = 2;
    while (bracketSize < numPlayers) bracketSize *= 2;
    const actualPlayers = qualifiedPlayers.slice(0, bracketSize);

    const rounds = [];
    let currentSize = actualPlayers.length;
    let matchNumber = 0;

    while (currentSize > 1) {
      const numMatches = currentSize / 2;
      const round = {
        id: generateId(),
        name: getRoundName(t, numMatches),
        matches: []
      };

      for (let i = 0; i < numMatches; i++) {
        matchNumber++;
        const match = {
          id: generateId(),
          matchNumber,
          player1: currentSize === actualPlayers.length ? actualPlayers[i * 2] || null : null,
          player2: currentSize === actualPlayers.length ? actualPlayers[i * 2 + 1] || null : null,
          status: 'pending'
        };
        round.matches.push(match);
      }
      rounds.push(round);
      currentSize = numMatches;
    }

    if (thirdPlaceMatch && rounds.length >= 2) {
      const lastRound = rounds[rounds.length - 1];
      lastRound.matches.push({
        id: generateId(),
        matchNumber: matchNumber + 1,
        player1: null,
        player2: null,
        isThirdPlaceMatch: true,
        status: 'pending'
      });
    }

    setPlayoffRounds(rounds);
    setPlayoffResults({});
  };

  const swapPlayoffPlayers = (roundIndex, matchIndex, otherMatchIndex) => {
    const newRounds = [...playoffRounds];
    const round = { ...newRounds[roundIndex], matches: [...newRounds[roundIndex].matches] };
    const match1 = { ...round.matches[matchIndex] };
    const match2 = { ...round.matches[otherMatchIndex] };

    const temp = match1.player2;
    match1.player2 = match2.player1;
    match2.player1 = temp;

    round.matches[matchIndex] = match1;
    round.matches[otherMatchIndex] = match2;
    newRounds[roundIndex] = round;
    setPlayoffRounds(newRounds);
  };

  const setPlayoffMatchPlayer = (roundIndex, matchIndex, slot, playerName) => {
    const newRounds = [...playoffRounds];
    const round = { ...newRounds[roundIndex], matches: [...newRounds[roundIndex].matches] };
    const match = { ...round.matches[matchIndex] };
    match[slot] = playerName;
    round.matches[matchIndex] = match;
    newRounds[roundIndex] = round;
    setPlayoffRounds(newRounds);
  };

  const setPlayoffResult = (matchId, field, value) => {
    setPlayoffResults(prev => ({
      ...prev,
      [matchId]: { ...prev[matchId], [field]: value }
    }));

    // Auto-advance winner to next round
    if (field === 'winner') {
      advanceWinner(matchId, value);
    }
  };

  const advanceWinner = (matchId, winnerName) => {
    for (let ri = 0; ri < playoffRounds.length - 1; ri++) {
      const round = playoffRounds[ri];
      const matchIndex = round.matches.findIndex(m => m.id === matchId && !m.isThirdPlaceMatch);
      if (matchIndex === -1) continue;

      const nextRound = playoffRounds[ri + 1];
      const nextMatchIndex = Math.floor(matchIndex / 2);
      const slot = matchIndex % 2 === 0 ? 'player1' : 'player2';

      if (nextRound.matches[nextMatchIndex]) {
        const newRounds = [...playoffRounds];
        const newNextRound = { ...newRounds[ri + 1], matches: [...newRounds[ri + 1].matches] };
        newNextRound.matches[nextMatchIndex] = { ...newNextRound.matches[nextMatchIndex], [slot]: winnerName };
        newRounds[ri + 1] = newNextRound;

        // Handle 3rd place match - losers of semifinals go to 3rd place
        if (thirdPlaceMatch && ri === playoffRounds.length - 2) {
          const lastRound = { ...newRounds[newRounds.length - 1], matches: [...newRounds[newRounds.length - 1].matches] };
          const thirdPlaceMatchObj = lastRound.matches.find(m => m.isThirdPlaceMatch);
          if (thirdPlaceMatchObj) {
            const match = round.matches[matchIndex];
            const loser = match.player1 === winnerName ? match.player2 : match.player1;
            const thirdPlaceIdx = lastRound.matches.findIndex(m => m.isThirdPlaceMatch);
            const tpSlot = matchIndex === 0 ? 'player1' : 'player2';
            lastRound.matches[thirdPlaceIdx] = { ...lastRound.matches[thirdPlaceIdx], [tpSlot]: loser };
            newRounds[newRounds.length - 1] = lastRound;
          }
        }

        setPlayoffRounds(newRounds);
      }
      break;
    }
  };

  // --- Validation ---

  const canProceed = () => {
    switch (currentStep) {
      case 0: return tournamentName.trim().length > 0;
      case 1: return playerNames.length >= 2;
      case 2: {
        if (groups.length === 0) return false;
        const allAssigned = groups.reduce((sum, g) => sum + g.players.length, 0) === playerNames.length;
        const allValid = groups.every(g => g.players.length >= 2);
        return allAssigned && allValid;
      }
      case 3: {
        const allMatches = Object.values(groupMatches).flat();
        return allMatches.every(m => {
          const r = matchResults[m.key];
          return r && r.winner && r.player1Legs >= 0 && r.player2Legs >= 0;
        });
      }
      case 4: {
        if (!playoffsEnabled) return true;
        return playoffRounds.every(round =>
          round.matches.every(match => {
            const isBye = (match.player1 && !match.player2) || (!match.player1 && match.player2);
            if (isBye) return true;
            if (!match.player1 || !match.player2) return false;
            const r = playoffResults[match.id];
            return r && r.winner && r.player1Legs >= 0 && r.player2Legs >= 0;
          })
        );
      }
      case 5: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && groups.length === 0) {
      autoDistributeGroups();
    }
    if (currentStep === 3 && playoffsEnabled && qualifiedPlayers.length === 0) {
      // Auto-select top players from each group based on standings
      const qualified = [];
      groupStandings.forEach(standings => {
        if (standings.length >= 1) qualified.push(standings[0].name);
        if (standings.length >= 2) qualified.push(standings[1].name);
      });
      setQualifiedPlayers(qualified);
    }
    setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  // --- Import ---

  const handleImport = async () => {
    setImporting(true);
    setImportError(null);

    try {
      const players = playerNames.map((name, i) => ({
        id: `temp-${i}`,
        name: name.trim()
      }));

      const tournamentGroups = groups.map((group) => {
        const groupPlayers = group.players.map(name => players.find(p => p.name === name));
        const matches = [];
        for (let a = 0; a < groupPlayers.length; a++) {
          for (let b = a + 1; b < groupPlayers.length; b++) {
            matches.push({
              id: generateId(),
              player1: groupPlayers[a],
              player2: groupPlayers[b],
              status: 'pending',
              result: null
            });
          }
        }
        return {
          name: group.name,
          players: groupPlayers,
          matches
        };
      });

      const tournamentData = {
        id: generateId(),
        name: tournamentName.trim(),
        players,
        groups: tournamentGroups,
        legsToWin,
        startingScore,
        groupSettings: { type: 'groups', value: numberOfGroups },
        playoffSettings: { enabled: playoffsEnabled, thirdPlaceMatch },
        tournamentType: 'groups_with_playoffs',
        standingsCriteriaOrder: ['matchesWon', 'legDifference', 'average', 'headToHead'],
        leagueId: selectedLeagueId || null,
        status: 'open_for_registration'
      };

      // 1. Create tournament
      const created = await tournamentService.createTournament(tournamentData);

      // 2. Build name→realId map from created tournament
      const nameToId = new Map();
      if (created.groups) {
        created.groups.forEach(g => {
          (g.players || []).forEach(p => {
            if (p && p.name && p.id) nameToId.set(p.name, p.id);
          });
        });
      }

      // 3. Set group match results
      if (created.groups) {
        for (const group of created.groups) {
          for (const match of group.matches || []) {
            const p1Name = match.player1?.name;
            const p2Name = match.player2?.name;
            if (!p1Name || !p2Name) continue;

            const key = getMatchKey(p1Name, p2Name);
            const result = matchResults[key];
            if (!result || !result.winner) continue;

            const winnerId = nameToId.get(result.winner);
            const matchId = match.id;

            await matchService.updateMatchResult(matchId, {
              winner: winnerId,
              player1Legs: result.winner === p1Name ? result.player1Legs : result.player2Legs,
              player2Legs: result.winner === p1Name ? result.player2Legs : result.player1Legs
            });
          }
        }
      }

      // 4. Create playoff matches if enabled
      if (playoffsEnabled && playoffRounds.length > 0) {
        const playoffsJsonRounds = [];

        for (let ri = 0; ri < playoffRounds.length; ri++) {
          const round = playoffRounds[ri];
          const roundMatches = [];

          for (let mi = 0; mi < round.matches.length; mi++) {
            const match = round.matches[mi];
            const p1Id = match.player1 ? nameToId.get(match.player1) : null;
            const p2Id = match.player2 ? nameToId.get(match.player2) : null;
            const isBye = (match.player1 && !match.player2) || (!match.player1 && match.player2);
            const byePlayer = isBye ? (match.player1 || match.player2) : null;
            const byePlayerId = byePlayer ? nameToId.get(byePlayer) : null;
            const result = playoffResults[match.id];
            const winnerId = isBye ? byePlayerId : (result ? nameToId.get(result.winner) : null);

            const dbMatchId = generateId();

            const matchResult = isBye
              ? { winner: byePlayerId, player1Legs: 0, player2Legs: 0, isBye: true }
              : result ? {
                  winner: winnerId,
                  player1Legs: result.winner === match.player1 ? result.player1Legs : result.player2Legs,
                  player2Legs: result.winner === match.player1 ? result.player2Legs : result.player1Legs
                } : null;

            await supabase.from('matches').insert({
              id: dbMatchId,
              tournament_id: created.id,
              player1_id: p1Id || null,
              player2_id: p2Id || null,
              status: 'completed',
              legs_to_win: legsToWin,
              starting_score: startingScore,
              is_playoff: true,
              playoff_round: ri + 1,
              playoff_match_number: mi + 1,
              winner_id: winnerId,
              player1_legs: matchResult ? matchResult.player1Legs : 0,
              player2_legs: matchResult ? matchResult.player2Legs : 0,
              result: matchResult,
              updated_at: new Date().toISOString()
            });

            roundMatches.push({
              id: dbMatchId,
              player1: match.player1 ? { id: p1Id, name: match.player1 } : null,
              player2: match.player2 ? { id: p2Id, name: match.player2 } : null,
              status: 'completed',
              isThirdPlaceMatch: match.isThirdPlaceMatch || false,
              playoffRound: ri + 1,
              playoffMatchNumber: mi + 1,
              result: matchResult
            });
          }

          playoffsJsonRounds.push({
            id: round.id,
            name: round.name,
            matches: roundMatches,
            isComplete: true
          });
        }

        const qualifyingPlayersWithIds = qualifiedPlayers.map(name => ({
          id: nameToId.get(name),
          name
        }));

        await tournamentService.updateTournamentPlayoffs(created.id, {
          qualifyingPlayers: qualifyingPlayersWithIds,
          currentRound: playoffRounds.length,
          rounds: playoffsJsonRounds
        });
      }

      // 5. Mark tournament completed
      await tournamentService.updateTournamentStatus(created.id, 'completed');

      // 6. Calculate league standings if linked
      if (selectedLeagueId) {
        const fullTournament = await tournamentService.getTournament(created.id);
        await leagueService.calculateTournamentPlacements(selectedLeagueId, created.id, fullTournament);
        await leagueService.updateLeaderboardCache(selectedLeagueId);
      }

      setImportSuccess(true);
    } catch (error) {
      console.error('Import failed:', error);
      setImportError(error.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const resetWizard = () => {
    setCurrentStep(0);
    setImporting(false);
    setImportError(null);
    setImportSuccess(false);
    setTournamentName('');
    setSelectedLeagueId('');
    setLegsToWin(3);
    setStartingScore(501);
    setPlayerNames([]);
    setNewPlayerName('');
    setNumberOfGroups(2);
    setGroups([]);
    setMatchResults({});
    setPlayoffsEnabled(true);
    setQualifiedPlayers([]);
    setPlayoffRounds([]);
    setPlayoffResults({});
    setThirdPlaceMatch(true);
  };

  // --- Render steps ---

  const renderStepSettings = () => (
    <div className="import-step-content">
      <div className="form-group">
        <label>{t('manager.importTournamentName')}</label>
        <input
          type="text"
          value={tournamentName}
          onChange={(e) => setTournamentName(e.target.value)}
          placeholder={t('manager.importTournamentName')}
          maxLength={50}
        />
      </div>

      <div className="form-group">
        <label>{t('manager.importSelectLeague')}</label>
        <select value={selectedLeagueId} onChange={(e) => setSelectedLeagueId(e.target.value)}>
          <option value="">{t('manager.importNoLeague')}</option>
          {(leagues || []).map(league => (
            <option key={league.id} value={league.id}>{league.name}</option>
          ))}
        </select>
      </div>

      <div className="import-settings-row">
        <div className="form-group">
          <label>{t('manager.importLegsToWin')}</label>
          <select value={legsToWin} onChange={(e) => setLegsToWin(parseInt(e.target.value))}>
            {[1, 2, 3, 4, 5, 7, 9].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>{t('manager.importStartingScore')}</label>
          <select value={startingScore} onChange={(e) => setStartingScore(parseInt(e.target.value))}>
            {[301, 501, 701].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );

  const renderStepPlayers = () => (
    <div className="import-step-content">
      <div className="import-add-player-row">
        <input
          type="text"
          value={newPlayerName}
          onChange={(e) => { setNewPlayerName(e.target.value); setPlayerError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
          placeholder={t('manager.importPlayerNamePlaceholder')}
        />
        <button className="admin-button primary" onClick={addPlayer}>
          <Plus size={16} />
          {t('manager.importAddPlayer')}
        </button>
      </div>
      {playerError && <p className="import-error-text">{playerError}</p>}

      <div className="import-player-list">
        {playerNames.map((name, i) => (
          <div key={i} className="import-player-item">
            <span>{name}</span>
            <button className="import-remove-btn" onClick={() => removePlayer(i)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      {playerNames.length > 0 && (
        <p className="import-info-text">{t('manager.importPlayersAdded', { count: playerNames.length })}</p>
      )}
      {playerNames.length < 2 && playerNames.length > 0 && (
        <p className="import-error-text">{t('manager.importMinPlayers')}</p>
      )}
    </div>
  );

  const renderStepGroups = () => {
    const unassigned = playerNames.filter(name => !groups.some(g => g.players.includes(name)));

    return (
      <div className="import-step-content">
        <div className="import-group-controls">
          <div className="form-group">
            <label>{t('manager.importNumberOfGroups')}</label>
            <input
              type="number"
              min={1}
              max={Math.floor(playerNames.length / 2)}
              value={numberOfGroups}
              onChange={(e) => setNumberOfGroups(parseInt(e.target.value) || 2)}
            />
          </div>
          <button className="admin-button primary" onClick={autoDistributeGroups}>
            <Shuffle size={16} />
            {t('manager.importAutoDistribute')}
          </button>
          {groups.length === 0 && (
            <button className="admin-button" onClick={initializeGroups}>
              {t('manager.importNext')}
            </button>
          )}
        </div>

        {groups.length > 0 && (
          <div className="import-group-grid">
            {unassigned.length > 0 && (
              <div className="import-group-column import-group-column--unassigned">
                <h4>{t('manager.importUnassigned')}</h4>
                {unassigned.map(name => (
                  <div key={name} className="import-group-player">
                    <span>{name}</span>
                    <select onChange={(e) => {
                      if (e.target.value !== '') {
                        const toGroup = parseInt(e.target.value);
                        const newGroups = groups.map((g, i) => i === toGroup ? { ...g, players: [...g.players, name] } : g);
                        setGroups(newGroups);
                      }
                    }} value="">
                      <option value="">→</option>
                      {groups.map((g, i) => (
                        <option key={i} value={i}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {groups.map((group, gi) => (
              <div key={gi} className="import-group-column">
                <h4>{group.name} ({group.players.length})</h4>
                {group.players.map(name => (
                  <div key={name} className="import-group-player">
                    <span>{name}</span>
                    <select onChange={(e) => {
                      if (e.target.value === 'remove') {
                        const newGroups = groups.map((g, i) => i === gi ? { ...g, players: g.players.filter(p => p !== name) } : g);
                        setGroups(newGroups);
                      } else if (e.target.value !== '') {
                        movePlayerToGroup(name, gi, parseInt(e.target.value));
                      }
                    }} value="">
                      <option value="">→</option>
                      <option value="remove">✕ Remove</option>
                      {groups.map((g, i) => i !== gi ? (
                        <option key={i} value={i}>{g.name}</option>
                      ) : null)}
                    </select>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderStepResults = () => (
    <div className="import-step-content">
      {groups.map((group, gi) => {
        const groupKey = `group_${gi}`;
        const matches = groupMatches[groupKey] || [];
        return (
          <div key={gi} className="import-results-group">
            <h4>{group.name}</h4>
            {matches.map(match => {
              const result = matchResults[match.key] || {};
              return (
                <div key={match.key} className="import-match-row">
                  <span className="import-match-row__players">
                    {match.player1} {t('manager.importVs')} {match.player2}
                  </span>
                  <div className="import-match-row__inputs">
                    <select
                      value={result.winner || ''}
                      onChange={(e) => setMatchResult(match.key, 'winner', e.target.value)}
                    >
                      <option value="">{t('manager.importSelectWinner')}</option>
                      <option value={match.player1}>{match.player1}</option>
                      <option value={match.player2}>{match.player2}</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={legsToWin}
                      value={result.player1Legs ?? ''}
                      onChange={(e) => setMatchResult(match.key, 'player1Legs', parseInt(e.target.value) || 0)}
                      placeholder={match.player1}
                    />
                    <span>-</span>
                    <input
                      type="number"
                      min={0}
                      max={legsToWin}
                      value={result.player2Legs ?? ''}
                      onChange={(e) => setMatchResult(match.key, 'player2Legs', parseInt(e.target.value) || 0)}
                      placeholder={match.player2}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  const renderStepPlayoffs = () => {
    // Default qualifiers from standings if not yet set
    const currentQualified = qualifiedPlayers.length > 0 ? qualifiedPlayers : (() => {
      const q = [];
      groupStandings.forEach(standings => {
        if (standings.length >= 1) q.push(standings[0].name);
        if (standings.length >= 2) q.push(standings[1].name);
      });
      return q;
    })();

    return (
      <div className="import-step-content">
        <div className="form-group">
          <label className="import-checkbox-label">
            <input
              type="checkbox"
              checked={playoffsEnabled}
              onChange={(e) => setPlayoffsEnabled(e.target.checked)}
            />
            {t('manager.importPlayoffsQuestion')}
          </label>
        </div>

        {playoffsEnabled && (
          <>
            <div className="import-qualifiers-section">
              <h4>{t('manager.importSelectQualifiers')}</h4>
              <div className="import-qualifier-list">
                {playerNames.map(name => (
                  <label key={name} className="import-checkbox-label">
                    <input
                      type="checkbox"
                      checked={currentQualified.includes(name)}
                      onChange={(e) => {
                        const newQ = e.target.checked
                          ? [...currentQualified, name]
                          : currentQualified.filter(n => n !== name);
                        setQualifiedPlayers(newQ);
                      }}
                    />
                    {name}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="import-checkbox-label">
                <input
                  type="checkbox"
                  checked={thirdPlaceMatch}
                  onChange={(e) => setThirdPlaceMatch(e.target.checked)}
                />
                {t('manager.importThirdPlaceMatch')}
              </label>
            </div>

            <button
              className="admin-button primary"
              onClick={() => {
                if (qualifiedPlayers.length === 0) setQualifiedPlayers(currentQualified);
                initializePlayoffs();
              }}
              disabled={currentQualified.length < 2}
            >
              <Trophy size={16} />
              {playoffRounds.length > 0 ? t('manager.importAdjustMatchups') : t('manager.importPlayoffMatchups')}
            </button>

            {playoffRounds.length > 0 && (
              <div className="import-playoff-bracket">
                <p className="import-info-text">{t('manager.importAdjustMatchups')}</p>
                {playoffRounds.map((round, ri) => (
                  <div key={round.id} className="import-playoff-round">
                    <h4>{round.name}</h4>
                    {round.matches.map((match, mi) => {
                      const result = playoffResults[match.id] || {};
                      return (
                        <div key={match.id} className={`import-match-row ${match.isThirdPlaceMatch ? 'import-match-row--third' : ''}`}>
                          {match.isThirdPlaceMatch && <span className="import-match-label">{t('manager.importThirdPlace')}</span>}
                          <div className="import-playoff-matchup">
                            {ri === 0 && !match.isThirdPlaceMatch ? (
                              <>
                                <select
                                  value={match.player1 || ''}
                                  onChange={(e) => setPlayoffMatchPlayer(ri, mi, 'player1', e.target.value)}
                                >
                                  <option value="">--</option>
                                  {(qualifiedPlayers.length > 0 ? qualifiedPlayers : currentQualified).map(name => (
                                    <option key={name} value={name}>{name}</option>
                                  ))}
                                </select>
                                <span>{t('manager.importVs')}</span>
                                <select
                                  value={match.player2 || ''}
                                  onChange={(e) => setPlayoffMatchPlayer(ri, mi, 'player2', e.target.value)}
                                >
                                  <option value="">--</option>
                                  {(qualifiedPlayers.length > 0 ? qualifiedPlayers : currentQualified).map(name => (
                                    <option key={name} value={name}>{name}</option>
                                  ))}
                                </select>
                              </>
                            ) : (
                              <span className="import-match-row__players">
                                {match.player1 || (match.player2 ? 'BYE' : '?')} {t('manager.importVs')} {match.player2 || (match.player1 ? 'BYE' : '?')}
                              </span>
                            )}
                          </div>
                          {match.player1 && match.player2 && (
                            <div className="import-match-row__inputs">
                              <select
                                value={result.winner || ''}
                                onChange={(e) => setPlayoffResult(match.id, 'winner', e.target.value)}
                              >
                                <option value="">{t('manager.importSelectWinner')}</option>
                                <option value={match.player1}>{match.player1}</option>
                                <option value={match.player2}>{match.player2}</option>
                              </select>
                              <input
                                type="number"
                                min={0}
                                max={legsToWin}
                                value={result.player1Legs ?? ''}
                                onChange={(e) => setPlayoffResult(match.id, 'player1Legs', parseInt(e.target.value) || 0)}
                                placeholder={match.player1}
                              />
                              <span>-</span>
                              <input
                                type="number"
                                min={0}
                                max={legsToWin}
                                value={result.player2Legs ?? ''}
                                onChange={(e) => setPlayoffResult(match.id, 'player2Legs', parseInt(e.target.value) || 0)}
                                placeholder={match.player2}
                              />
                            </div>
                          )}
                          {((match.player1 && !match.player2) || (!match.player1 && match.player2)) && (
                            <span className="bye-badge">BYE</span>
                          )}
                          {ri === 0 && !match.isThirdPlaceMatch && mi < round.matches.length - 1 && (
                            <button
                              className="import-swap-btn"
                              onClick={() => swapPlayoffPlayers(ri, mi, mi + 1)}
                              title={t('manager.importSwapPlayers')}
                            >
                              <ArrowUpDown size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderStepReview = () => {
    const leagueName = (leagues || []).find(l => l.id === selectedLeagueId)?.name;
    return (
      <div className="import-step-content">
        <div className="import-summary">
          <div className="import-summary__stat">
            <span>{t('manager.importTournamentName')}</span>
            <strong>{tournamentName}</strong>
          </div>
          <div className="import-summary__stat">
            <span>{t('manager.importLinkedToLeague')}</span>
            <strong>{leagueName || t('manager.importNo')}</strong>
          </div>
          <div className="import-summary__stat">
            <span>{t('manager.importStepPlayers')}</span>
            <strong>{playerNames.length}</strong>
          </div>
          <div className="import-summary__stat">
            <span>{t('manager.importStepGroups')}</span>
            <strong>{groups.length}</strong>
          </div>
          <div className="import-summary__stat">
            <span>{t('manager.importGroupMatches')}</span>
            <strong>{totalGroupMatches}</strong>
          </div>
          {playoffsEnabled && (
            <div className="import-summary__stat">
              <span>{t('manager.importPlayoffMatches')}</span>
              <strong>{totalPlayoffMatches}</strong>
            </div>
          )}
          <div className="import-summary__stat">
            <span>{t('manager.importTotalMatches')}</span>
            <strong>{totalGroupMatches + (playoffsEnabled ? totalPlayoffMatches : 0)}</strong>
          </div>
          <div className="import-summary__stat">
            <span>{t('manager.importLegsToWin')}</span>
            <strong>{legsToWin}</strong>
          </div>
          <div className="import-summary__stat">
            <span>{t('manager.importStartingScore')}</span>
            <strong>{startingScore}</strong>
          </div>
        </div>

        {importError && (
          <div className="admin-message error">
            <AlertCircle size={16} />
            <span>{t('manager.importFailed', { error: importError })}</span>
          </div>
        )}

        {importSuccess && (
          <div className="admin-message success">
            <Check size={16} />
            <span>{selectedLeagueId ? t('manager.importSuccess') : t('manager.importSuccessNoLeague')}</span>
          </div>
        )}
      </div>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0: return renderStepSettings();
      case 1: return renderStepPlayers();
      case 2: return renderStepGroups();
      case 3: return renderStepResults();
      case 4: return renderStepPlayoffs();
      case 5: return renderStepReview();
      default: return null;
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <Upload size={20} />
        <h2>{t('manager.importTournament')}</h2>
      </div>
      <p className="admin-section-description">{t('manager.importDescription')}</p>

      <div className="import-wizard">
        <div className="import-stepper">
          {STEPS.map((step, i) => (
            <div
              key={step}
              className={`import-stepper__step ${i === currentStep ? 'import-stepper__step--active' : ''} ${i < currentStep ? 'import-stepper__step--completed' : ''}`}
              onClick={() => i < currentStep && setCurrentStep(i)}
            >
              <div className="import-stepper__dot">
                {i < currentStep ? <Check size={12} /> : i + 1}
              </div>
              <span className="import-stepper__label">{t(`manager.${step}`)}</span>
            </div>
          ))}
        </div>

        <div className="import-wizard__content">
          {renderCurrentStep()}
        </div>

        <div className="import-wizard__actions">
          {currentStep > 0 && !importSuccess && (
            <button className="admin-button" onClick={handleBack} disabled={importing}>
              <ArrowLeft size={16} />
              {t('manager.importBack')}
            </button>
          )}
          <div className="import-wizard__actions-right">
            {currentStep < STEPS.length - 1 && (
              <button className="admin-button primary" onClick={handleNext} disabled={!canProceed()}>
                {t('manager.importNext')}
                <ArrowRight size={16} />
              </button>
            )}
            {currentStep === STEPS.length - 1 && !importSuccess && (
              <button className="admin-button primary" onClick={handleImport} disabled={importing}>
                {importing ? (
                  <>
                    <Loader size={16} className="spinning" />
                    {t('manager.importImporting')}
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    {t('manager.importConfirmButton')}
                  </>
                )}
              </button>
            )}
            {importSuccess && (
              <button className="admin-button primary" onClick={resetWizard}>
                {t('manager.importStartNew')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
