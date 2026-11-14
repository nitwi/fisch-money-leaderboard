"""Select the latest point per Chicago day, with full Saturday snapshots from Nov 14 onward.

12:00–1:59 AM can update the preceding day's cycle when taken within three
hours of its latest photo, even if that day had an evening capture. It also
closes a preceding day with no afternoon capture. Times on the board and
per-player interval math remain actual UTC instants; only the daily tick label
is reassigned. Beginning November 14, 2026, every distinct complete Top-50
Saturday session is a separately navigable point within the same leaderboard
day, including a later evening set after the pre/post-update pair. Incomplete
intermediate photos remain context, not new points; earlier Saturdays retain
their original one-per-day selection rule.
"""

from collections import Counter, defaultdict
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from sessions import instant

CHICAGO = ZoneInfo("America/Chicago")
CLOSE_UPDATE_WINDOW = timedelta(hours=3)
SATURDAY_MULTI_START = date(2026,11,14)


def local_time(utc_at):
    return instant(utc_at).astimezone(CHICAGO)


def select_daily(sessions, session_observations, raw_captures, early_cutoff_hour=2):
    if not 0 < early_cutoff_hour <= 6:
        raise ValueError("Early-AM cutoff must be between 1 and 6 local hours")
    captures_by_id = {cp["id"]: cp for cp in raw_captures}
    afternoon = {local_time(cp["at"]).date() for cp in raw_captures if local_time(cp["at"]).hour >= 12}
    sessions_by_day = defaultdict(list)
    assignment = {}
    for cp in sorted(sessions, key=lambda item: item["at"]):
        local = local_time(cp["at"])
        day = local.date()
        if local.hour < early_cutoff_hour:
            prior = day - timedelta(days=1)
            same_session_prior_afternoon = any(
                local_time(captures_by_id[raw_id]["at"]).date() == prior
                and local_time(captures_by_id[raw_id]["at"]).hour >= 12
                for raw_id in cp["source_checkpoints"]
            )
            prior_options = sessions_by_day.get(prior.isoformat(), [])
            latest_prior = prior_options[-1] if prior_options else None
            close_update = (
                latest_prior is not None
                and timedelta(0) < instant(cp["at"]) - instant(latest_prior["at"]) <= CLOSE_UPDATE_WINDOW
            )
            if same_session_prior_afternoon or close_update or prior not in afternoon:
                day = prior
        key = day.isoformat()
        assignment[cp["id"]] = key
        sessions_by_day[key].append(cp)

    by_session = defaultdict(list)
    for row in session_observations:
        by_session[row["checkpoint"]].append(row)
    daily = []
    rows = []
    for day, options in sorted(sessions_by_day.items()):
        ordered=sorted(options,key=lambda cp:cp['at'])
        full=[cp for cp in ordered if cp['complete']]
        saturday=date.fromisoformat(day)
        chosen=full if saturday>=SATURDAY_MULTI_START and saturday.weekday()==5 and full else [ordered[-1]]
        for position, selected in enumerate(chosen,1):
            context=[cp for cp in ordered if cp['at']<=selected['at']]
            earlier=[cp for cp in context if cp['id']!=selected['id']]
            all_evidence=list(dict.fromkeys(eid for cp in context for eid in cp['evidence']))
            daily.append({**selected, "day_key": day, "daily_source_sessions": [cp['id'] for cp in context],
                          "earlier_session_ids": [cp['id'] for cp in earlier],
                          "primary_evidence": list(selected['evidence']),
                          "captured_from": min(cp['captured_from'] for cp in context),
                          "captured_to": max(cp['captured_to'] for cp in context),
                          "evidence": all_evidence,
                          "day_snapshot_number":position,"day_snapshot_count":len(chosen),
                          "early_am_rollover": local_time(selected['at']).date().isoformat() != day})
            selected_rows=by_session[selected['id']]
            if len(selected_rows)!=50:
                raise ValueError(f"Daily snapshot must retain 50 rank slots: {day}")
            rows.extend({**row,"day_key":day} for row in selected_rows)
    if len(rows) != 50 * len(daily):
        raise ValueError("Daily ledger has missing or duplicated rank slots")
    return daily, rows, dict(Counter(row["status"] for row in rows)), assignment
