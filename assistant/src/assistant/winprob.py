# Port of src/lib/winProbability.js and biggestUpset / formatChance in src/utils/upsets.js; the JS is the source of truth,
# regenerate tests/winprob_cases.json when it changes (node assistant/tests/winprob_cases.mjs). No I/O here.
import math

AVG_SCALE = 6  # points of average per logit
HALF_LIFE = 10
PRIOR_DARTS = 240
FIELD_AVERAGE = 41
HISTORY_MATCHES = 60


def leg_win_probability(avg_a: float, avg_b: float, scale: float = AVG_SCALE) -> float:
    return 1 / (1 + math.exp(-(avg_a - avg_b) / scale))


def chance_to_win_first(p: float, need_a: int, need_b: int) -> float:
    # Chance A wins need_a legs before B wins need_b, each leg won with chance p (negative binomial tail).
    if need_a <= 0:
        return 1
    if need_b <= 0:
        return 0
    total, combos = 0.0, 1.0  # combos = C(need_a - 1 + k, k)
    for k in range(need_b):
        if k > 0:
            combos = combos * (need_a - 1 + k) / k
        total += combos * p ** need_a * (1 - p) ** k
    return total


def match_win_probability(avg_a, avg_b, legs_to_win: int = 3, legs_a: int = 0, legs_b: int = 0,
                          scale: float = AVG_SCALE) -> float | None:
    if not (avg_a and avg_a > 0) or not (avg_b and avg_b > 0):  # None / 0: no average to go on
        return None
    return chance_to_win_first(leg_win_probability(avg_a, avg_b, scale), legs_to_win - legs_a, legs_to_win - legs_b)


def player_strength(history: list[dict], half_life: float = HALF_LIFE, prior_darts: float = PRIOR_DARTS,
                    field_average: float = FIELD_AVERAGE) -> float | None:
    # History is newest first, each {"score", "darts"}; PRIOR_DARTS darts at the field average are mixed in.
    score = prior_darts * field_average / 3
    darts = prior_darts
    for i, m in enumerate(history):
        w = 0.5 ** (i / half_life) if math.isfinite(half_life) else 1
        score += w * m["score"]
        darts += w * m["darts"]
    return score / darts * 3 if darts > 0 else None


def strength_history(history: list[dict], count: int) -> list[dict]:
    # The strength after each of the last `count` matches, oldest first, from a newest-first history.
    return [{"at": history[i].get("at") or None, "strength": player_strength(history[i:])}
            for i in range(min(count, len(history)) - 1, -1, -1)]


def biggest_upset(matches: list[dict], strengths: dict[str, float], max_chance: float = 0.4) -> dict | None:
    # The completed X01 match whose winner had the lowest chance beforehand, below max_chance, or None.
    best = None
    for m in matches:
        p1_id, p2_id, winner = m["player1_id"], m["player2_id"], m["winner_id"]
        if m["status"] != "completed" or not winner or not p1_id or not p2_id:
            continue
        if m["game_type"] == "cricket":  # strengths are X01 averages
            continue
        legs = (m["player1_legs"] or 0, m["player2_legs"] or 0)
        p1 = match_win_probability(strengths.get(p1_id), strengths.get(p2_id), legs_to_win=m["legs_to_win"] or max(legs))
        if p1 is None:
            continue
        is_p1 = winner == p1_id
        chance = p1 if is_p1 else 1 - p1
        if chance < max_chance and (best is None or chance < best["chance"]):
            best = {"winner_id": p1_id if is_p1 else p2_id, "loser_id": p2_id if is_p1 else p1_id,
                    "score": f"{legs[0]}:{legs[1]}" if is_p1 else f"{legs[1]}:{legs[0]}", "chance": chance}
    return best


def format_chance(p: float) -> str:
    # formatChance in src/utils/upsets.js: whole percent, "<1%" below 0.5%. floor(x + .5) is Math.round; round() goes to even.
    return "<1%" if p < 0.005 else f"{math.floor(p * 100 + 0.5)}%"
