// Shared helpers for the configurable playoff seed-slot template.
//
// The seed template lets organizers arrange abstract slots ("Group A - 1st",
// "Group B - 4th", or global seed "3") into first-round bracket positions BEFORE
// anyone has qualified. At playoff-generation time each slot is resolved to the
// real qualified player (or a bye when the seed doesn't exist).
//
// These functions are pure so they can be reused by both the editor component
// (BracketSeedingEditor) and the resolver (applyCustomSeeding in
// TournamentManagement) and unit-tested in isolation.

// Smallest power of two >= n (minimum 1).
export function nextPow2(n) {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

// Short, human-friendly group label. "Group A" -> "A"; falls back to the full
// name when it isn't in the "Group X" form.
export function groupLabel(name) {
  if (!name) return '?';
  const match = /^group\s+(.+)$/i.exec(name.trim());
  return match ? match[1] : name;
}

// How many players advance per group, given the qualification settings.
// - perGroup mode  -> playersPerGroup
// - totalPlayers   -> ceil(total / numGroups) so the editor exposes the maximum
//   possible slots; seeds that end up unfilled simply become byes.
export function qualifiersPerGroup(playoffSettings, numGroups) {
  const ps = playoffSettings || {};
  if (ps.qualificationMode === 'totalPlayers') {
    const total = ps.totalPlayersToAdvance || 0;
    if (!numGroups) return total;
    return Math.ceil(total / numGroups);
  }
  return ps.playersPerGroup || 1;
}

// Fingerprint of the settings a template was built against. Used to detect when
// the template has gone stale (group count / qualifier count / group names
// changed) so we can fall back to the hardcoded seeding instead of producing a
// wrong bracket.
export function buildSignature(playoffSettings, groups) {
  const groupNames = Array.isArray(groups) ? groups.map((g) => g?.name).filter(Boolean) : [];
  const numGroups = groupNames.length;
  return {
    numGroups,
    qualifiersPerGroup: qualifiersPerGroup(playoffSettings, numGroups),
    groupNames,
  };
}

export function signaturesEqual(a, b) {
  if (!a || !b) return false;
  if (a.numGroups !== b.numGroups) return false;
  if (a.qualifiersPerGroup !== b.qualifiersPerGroup) return false;
  const an = a.groupNames || [];
  const bn = b.groupNames || [];
  if (an.length !== bn.length) return false;
  return an.every((name, i) => name === bn[i]);
}

// Build a stable id for a slot so the editor can track usage and selections.
export function slotId(slot) {
  if (!slot) return '';
  if (slot.seed != null) return `seed:${slot.seed}`;
  if (slot.group != null && slot.rank != null) return `group:${slot.group}:${slot.rank}`;
  return '';
}

// Enumerate the pool of selectable seed slots from the current settings.
//
// Returns { mode, bracketSize, signature, pool } where pool is an array of
//   { id, label, group?, rank?, seed? }
//
// - Grouped tournaments  -> mode 'perGroup', slots like { group:'Group A', rank:1, label:'A1' }
// - Playoff-only / no groups -> mode 'global', slots like { seed:1, label:'1' }
export function enumerateSeedSlots(playoffSettings, groups, options = {}) {
  const groupList = Array.isArray(groups) ? groups.filter((g) => g?.name) : [];
  const numGroups = groupList.length;
  const signature = buildSignature(playoffSettings, groups);

  if (numGroups > 0) {
    // When an explicit bracketSize is requested (preset library), derive how many
    // ranks per group that bracket needs; otherwise use the qualification settings.
    const perGroup = options.bracketSize
      ? Math.ceil(options.bracketSize / numGroups)
      : signature.qualifiersPerGroup;
    const pool = [];
    groupList.forEach((g) => {
      const short = groupLabel(g.name);
      for (let rank = 1; rank <= perGroup; rank += 1) {
        const slot = { group: g.name, rank, label: `${short}${rank}` };
        pool.push({ ...slot, id: slotId(slot) });
      }
    });
    return {
      mode: 'perGroup',
      bracketSize: options.bracketSize || nextPow2(pool.length),
      signature: { ...signature, qualifiersPerGroup: perGroup },
      pool,
    };
  }

  // Global / playoff-only mode: enumerate seeds 1..N.
  const totalSeeds =
    options.bracketSize ||
    options.totalSeeds ||
    playoffSettings?.totalPlayersToAdvance ||
    options.totalPlayers ||
    0;
  const pool = [];
  for (let seed = 1; seed <= totalSeeds; seed += 1) {
    const slot = { seed, label: `${seed}` };
    pool.push({ ...slot, id: slotId(slot) });
  }
  return {
    mode: 'global',
    bracketSize: options.bracketSize || nextPow2(pool.length),
    signature,
    pool,
  };
}

// Is a custom-seeding object usable for resolution? (enabled with a slot array)
export function hasUsableTemplate(customSeeding) {
  return !!(customSeeding && customSeeding.enabled && Array.isArray(customSeeding.slots) && customSeeding.slots.length > 0);
}

// Lookup key for the prepared-config library: (number of groups, bracket start size).
// e.g. 4 groups starting at top-16 -> "4-16". Playoff-only tournaments use "0-<size>".
export function presetKey(numGroups, bracketSize) {
  return `${numGroups || 0}-${bracketSize || 0}`;
}

// The bracket start size a given setup resolves to: nextPow2(groups * qualifiersPerGroup),
// or nextPow2(totalPlayersToAdvance) for playoff-only setups.
export function bracketSizeForSettings(playoffSettings, groups) {
  const numGroups = Array.isArray(groups) ? groups.filter((g) => g?.name).length : 0;
  if (numGroups > 0) {
    return nextPow2(numGroups * qualifiersPerGroup(playoffSettings, numGroups));
  }
  return nextPow2(playoffSettings?.totalPlayersToAdvance || 0);
}

// Resolve which seed template (if any) applies to a tournament, in precedence order:
//   1. A per-tournament custom template (customSeeding) whose signature still matches.
//   2. A matching entry in the prepared-config library (seedingPresets), keyed by
//      (numGroups, bracketStart).
//   3. null  -> caller falls back to automatic seeding.
// Returns { slots, mode, bracketSize, source } or null.
export function resolveActiveTemplate(playoffSettings, groups) {
  const ps = playoffSettings || {};
  const numGroups = Array.isArray(groups) ? groups.filter((g) => g?.name).length : 0;

  // 1. Per-tournament override.
  if (hasUsableTemplate(ps.customSeeding)) {
    const currentSignature = buildSignature(ps, groups);
    if (signaturesEqual(currentSignature, ps.customSeeding.signature)) {
      return {
        slots: ps.customSeeding.slots,
        mode: ps.customSeeding.mode,
        bracketSize: ps.customSeeding.bracketSize,
        source: 'tournament',
      };
    }
  }

  // 2. League-prepared library preset matching (numGroups, bracketStart).
  const presets = ps.seedingPresets;
  if (presets && typeof presets === 'object') {
    const bracketSize = bracketSizeForSettings(ps, groups);
    const key = presetKey(numGroups, bracketSize);
    const preset = presets[key];
    if (preset && preset.enabled && Array.isArray(preset.slots) && preset.slots.length > 0) {
      return {
        slots: preset.slots,
        mode: preset.mode || (numGroups > 0 ? 'perGroup' : 'global'),
        bracketSize: preset.bracketSize || bracketSize,
        source: 'library',
      };
    }
  }

  return null;
}
