# Leitner Box System

FlashCards schedules practice with a 3-box Leitner system. Implementation is in
`src/scripts/js/modules/auth/practiceService.mjs` and `src/scripts/sql/pg/practice-queries.sql`.
State lives in `flashcard_leitner_progress` (one row per user per accessible card). The older
`leitner_boxes` table is not used.

## Boxes

| Box | Meaning             | Eligible weekdays (server time)         | Interval after a completed session | Repetitions per session |
| --- | ------------------- | --------------------------------------- | ---------------------------------- | ----------------------- |
| 1   | New or missed cards | Every day                               | next midnight + 1 day              | 3                       |
| 2   | Learning            | Sun, Tue, Thu, Sat (`getDay()` is even) | + 3 days                           | 2                       |
| 3   | Mastered            | Friday only                             | + 7 days                           | 1                       |

A card is **due** only when both conditions hold:

1. its box is eligible today (table above), **and**
2. `next_review IS NULL OR next_review <= NOW()`.

`next_review` is set to midnight (00:00 server local time; UTC on Render) of today + 1, 3, or 7 days.
Because of the weekday gate, a box-3 card is reviewed on the first Friday at least 7 days after
its last completed session. A box-2 card is reviewed on the first even weekday at least 3 days later.

> ⚠️ Known inconsistencies in the code:
>
> - The code comment says the even days are "Mon, Wed, Fri, Sun", but JavaScript's `getDay()`
>   evens are **Sun, Tue, Thu, Sat**. The table above shows the actual behavior.
> - `getReviewSchedule()` (the "Review Schedule" panel) reports Box 2 as due "Today" on Fridays,
>   but `getDueCardsForToday()` does not include Box 2 on Fridays.
> - The practice page labels Box 2 "Every 3 Days". The 3-day interval is correct, but the weekday gate can stretch it.

## Lifecycle of a card

1. **Initialization:** `initializeAllCardsForUser` inserts a progress row (box 1, `next_review = NOW()`)
   for every accessible card that doesn't have one yet: owned cards, accepted shares, and public cards not removed.
   It runs on the practice page load, `GET /api/practice/next`, and `GET /api/practice/dashboard`.
2. **Selection:** `GET /api/practice/next` picks a **random** card among the due cards that match the active filters.
   (The query orders by box then `last_reviewed`, but the route then picks randomly.)
3. **Answering:** the browser grades the answer and posts `POST /api/practice/answer` with the `sessionStartTime`
   that it generated when the user clicked Start.
4. **Repetitions:** each attempt adds a `session_card_attempts` row and a `practice_history` row, and increments
   `times_correct` or `times_incorrect`. The box doesn't change until the card has been answered
   3, 2, or 1 times (by its box at the start of the session) within this `sessionStartTime`.
   Until then, the response says `needsMoreAttempts: true` and the card stays due.
5. **Box transition**, when the repetitions are complete:
   - all attempts in the session correct → promote one box (box 3 stays in box 3)
   - any attempt incorrect → back to box 1
   - `last_reviewed = NOW()`, `next_review` set per the new box.

Legacy mode: if a client omits `sessionStartTime`, each answer promotes or demotes immediately,
and the card's difficulty score is recalculated. The current UI always sends `sessionStartTime`.

## Catch-up mode

When nothing is due, the page offers catch-up practice: `GET /api/practice/next?catchUp=true`
returns a random box-1 or box-2 card and ignores the weekday gate and `next_review`.
The class, lesson, and category filters are **not applied** in catch-up mode.

## Filters

The practice filter panel (`partials/filter-panel.ejs`) sends `class`, `lesson`, and `category`.
Matching is case-insensitive, and a trailing `*` is a prefix wildcard. Filters limit:

- which due cards are served,
- the box counts and attempt totals (`/api/practice/stats`),
- today's summary (`/api/practice/summary`).

Distractors (wrong options) always come from cards with the **same class and category** as the
current card (NULL treated as empty string), from any lesson. See
[NONE_OF_ABOVE_FEATURE.md](./NONE_OF_ABOVE_FEATURE.md) for how options are built.

## Statistics

| Stat                              | Source                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Box counts                        | `flashcard_leitner_progress.current_box` (filtered by card fields)                                    |
| Total correct/incorrect, accuracy | `practice_history` joined to card fields                                                              |
| Today's progress                  | `practice_history` rows created today                                                                 |
| Streak                            | Consecutive correct `practice_history` rows, most recent first (unfiltered, capped at 100)            |
| Home dashboard                    | Per class → lesson and per category: box counts, plus accuracy from `times_correct`/`times_incorrect` |

An admin can reset a user's progress (all cards back to box 1, counters zeroed) with
`POST /api/admin/users/:userId/reset-stats`. History rows are kept.

## Why Leitner

It's simple to explain, the box a card sits in is visible to the learner, and it needs only a few
counters per card. Per-card difficulty scoring ([DIFFICULTY_SCORING.md](./DIFFICULTY_SCORING.md))
runs alongside it and is used by quiz selection, not by scheduling.
